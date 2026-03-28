/**
 * POST /api/groups/members/kick — Kick a member from a specific group
 * Requires lead role. Uses ban+unban (soft kick, user can rejoin via invite).
 */
import { NextResponse } from "next/server";
import { requireLeadRole } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { group_id, telegram_user_id, member_name } = body;

  if (!group_id || typeof telegram_user_id !== "number" || !Number.isInteger(telegram_user_id) || telegram_user_id <= 0) {
    return NextResponse.json({ error: "Valid group_id and numeric telegram_user_id required" }, { status: 400 });
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
    const unbanRes = await fetch(
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
    const unbanData = await unbanRes.json();
    const unbanWarning = !unbanData.ok
      ? "User was removed but unban failed — they may be permanently banned. Check manually."
      : undefined;

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
      metadata: { kicked_by: user.id, immediately_unbanned: unbanData.ok },
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
        unban_succeeded: unbanData.ok,
      },
    });

    return NextResponse.json({ ok: true, group_name: group.group_name, warning: unbanWarning });
  } catch (err) {
    console.error("[groups/members/kick] error:", err);
    return NextResponse.json({ error: "Failed to kick member" }, { status: 500 });
  }
}
