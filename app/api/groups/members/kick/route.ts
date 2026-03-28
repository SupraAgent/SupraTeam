/**
 * POST /api/groups/members/kick — Kick a member from a specific group
 * Bot must be admin. Uses ban+unban (soft kick, user can rejoin via invite).
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  const body = await request.json();
  const { group_id, telegram_user_id, member_name } = body;

  if (!group_id || !telegram_user_id) {
    return NextResponse.json({ error: "group_id and telegram_user_id required" }, { status: 400 });
  }

  // Get group info
  const { data: group } = await supabase
    .from("tg_groups")
    .select("id, telegram_group_id, group_name, bot_is_admin")
    .eq("id", group_id)
    .single();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  if (!group.bot_is_admin) {
    return NextResponse.json({ error: "Bot is not admin in this group" }, { status: 400 });
  }

  try {
    // Ban the user (kicks them)
    const banRes = await fetch(
      `https://api.telegram.org/bot${botToken}/banChatMember`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: group.telegram_group_id,
          user_id: telegram_user_id,
        }),
      }
    );
    const banData = await banRes.json();

    if (!banData.ok) {
      return NextResponse.json({
        error: banData.description ?? "Failed to remove member",
      }, { status: 400 });
    }

    // Immediately unban so they can rejoin later via invite
    await fetch(
      `https://api.telegram.org/bot${botToken}/unbanChatMember`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: group.telegram_group_id,
          user_id: telegram_user_id,
          only_if_banned: true,
        }),
      }
    );

    // Update member record to "left"
    await supabase
      .from("tg_group_members")
      .update({ role: "left", updated_at: new Date().toISOString() })
      .eq("group_id", group_id)
      .eq("telegram_user_id", telegram_user_id);

    // Log member event
    await supabase.from("tg_group_member_events").insert({
      group_id,
      telegram_user_id,
      event_type: "banned",
      metadata: { kicked_by: user.id, immediately_unbanned: true },
    });

    // Audit log
    const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";
    await logAudit({
      action: "member_kicked",
      entityType: "tg_group",
      entityId: group_id,
      actorId: user.id,
      actorName: userName,
      details: {
        telegram_user_id,
        member_name: member_name ?? "Unknown",
        group_name: group.group_name,
      },
    });

    return NextResponse.json({ ok: true, group_name: group.group_name });
  } catch (err) {
    console.error("[groups/members/kick] error:", err);
    return NextResponse.json({ error: "Failed to kick member" }, { status: 500 });
  }
}
