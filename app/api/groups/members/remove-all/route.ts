/**
 * POST /api/groups/members/remove-all — Remove a person from ALL groups (nuclear remove)
 * Requires lead role. Only kicks from groups where user is a tracked member.
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

  const { telegram_user_id, member_name } = body;

  if (typeof telegram_user_id !== "number" || !Number.isInteger(telegram_user_id) || telegram_user_id <= 0) {
    return NextResponse.json({ error: "Valid numeric telegram_user_id required" }, { status: 400 });
  }

  // Only kick from groups where user is a tracked, non-left member
  const { data: memberRecords } = await supabase
    .from("tg_group_members")
    .select("group_id, group:tg_groups(id, telegram_group_id, group_name, bot_is_admin)")
    .eq("telegram_user_id", telegram_user_id)
    .not("role", "eq", "left");

  if (!memberRecords || memberRecords.length === 0) {
    return NextResponse.json({ error: "User not found in any tracked groups" }, { status: 404 });
  }

  // Filter to groups where bot is admin
  const groups = memberRecords
    .map((mr) => mr.group as unknown as { id: string; telegram_group_id: number; group_name: string; bot_is_admin: boolean } | null)
    .filter((g): g is { id: string; telegram_group_id: number; group_name: string; bot_is_admin: boolean } =>
      g !== null && g.bot_is_admin
    );

  if (groups.length === 0) {
    return NextResponse.json({ error: "Bot is not admin in any of this user's groups" }, { status: 400 });
  }

  const results: Array<{ group_id: string; group_name: string; success: boolean; warning?: string; error?: string }> = [];

  for (const group of groups) {
    try {
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

      if (banData.ok) {
        // Immediately unban
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

        results.push({
          group_id: group.id,
          group_name: group.group_name,
          success: true,
          warning: !unbanData.ok ? "Ban succeeded but unban failed — user may be permanently banned" : undefined,
        });
      } else {
        const desc = banData.description ?? "";
        const isNotInGroup = desc.includes("user not found") || desc.includes("USER_NOT_PARTICIPANT");
        results.push({
          group_id: group.id,
          group_name: group.group_name,
          success: isNotInGroup,
          error: isNotInGroup ? undefined : desc,
        });
      }
    } catch (err) {
      results.push({
        group_id: group.id,
        group_name: group.group_name,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Update member records for successful kicks
  for (const r of results.filter((r) => r.success)) {
    await supabase
      .from("tg_group_members")
      .update({ role: "left", updated_at: new Date().toISOString() })
      .eq("group_id", r.group_id)
      .eq("telegram_user_id", telegram_user_id);

    await supabase.from("tg_group_member_events").insert({
      group_id: r.group_id,
      telegram_user_id,
      event_type: "banned",
      metadata: { kicked_by: user.id, nuclear_remove: true },
    });
  }

  // Audit log
  const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";
  const successCount = results.filter((r) => r.success).length;
  await logAudit({
    action: "nuclear_remove",
    entityType: "tg_member",
    entityId: String(telegram_user_id),
    actorId: user.id,
    actorName: userName,
    details: {
      telegram_user_id,
      member_name: member_name ?? "Unknown",
      groups_attempted: results.length,
      groups_removed: successCount,
      groups_failed: results.length - successCount,
      warnings: results.filter((r) => r.warning).map((r) => ({ name: r.group_name, warning: r.warning })),
      failures: results.filter((r) => !r.success && r.error).map((r) => ({ name: r.group_name, error: r.error })),
    },
  });

  return NextResponse.json({
    ok: true,
    total: results.length,
    success: successCount,
    failed: results.length - successCount,
    results,
  });
}
