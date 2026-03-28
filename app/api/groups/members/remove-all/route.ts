/**
 * POST /api/groups/members/remove-all — Remove a person from ALL groups (nuclear remove)
 * Used for offboarding. Kicks from every group where bot is admin.
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
  const { telegram_user_id, member_name } = body;

  if (!telegram_user_id) {
    return NextResponse.json({ error: "telegram_user_id required" }, { status: 400 });
  }

  // Find all groups where this user is a member AND bot is admin
  const { data: memberRecords } = await supabase
    .from("tg_group_members")
    .select("group_id, group:tg_groups(id, telegram_group_id, group_name, bot_is_admin)")
    .eq("telegram_user_id", telegram_user_id)
    .not("role", "eq", "left");

  if (!memberRecords || memberRecords.length === 0) {
    // Fallback: try all groups where bot is admin (user might not be tracked)
    const { data: allGroups } = await supabase
      .from("tg_groups")
      .select("id, telegram_group_id, group_name, bot_is_admin")
      .eq("bot_is_admin", true);

    if (!allGroups || allGroups.length === 0) {
      return NextResponse.json({ error: "No groups available" }, { status: 404 });
    }

    // Try to kick from all admin groups
    const results = await kickFromGroups(botToken, allGroups, telegram_user_id);

    await logRemoval(supabase, user, telegram_user_id, member_name, results);

    return NextResponse.json({
      ok: true,
      total: results.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
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

  const results = await kickFromGroups(botToken, groups, telegram_user_id);

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
      metadata: { kicked_by: user.id, nuclear_remove: true, immediately_unbanned: true },
    });
  }

  await logRemoval(supabase, user, telegram_user_id, member_name, results);

  return NextResponse.json({
    ok: true,
    total: results.length,
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}

async function kickFromGroups(
  botToken: string,
  groups: Array<{ id: string; telegram_group_id: number; group_name: string }>,
  telegramUserId: number
) {
  const results: Array<{ group_id: string; group_name: string; success: boolean; error?: string }> = [];

  for (const group of groups) {
    try {
      const banRes = await fetch(
        `https://api.telegram.org/bot${botToken}/banChatMember`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: group.telegram_group_id,
            user_id: telegramUserId,
          }),
        }
      );
      const banData = await banRes.json();

      if (banData.ok) {
        // Immediately unban
        await fetch(
          `https://api.telegram.org/bot${botToken}/unbanChatMember`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: group.telegram_group_id,
              user_id: telegramUserId,
              only_if_banned: true,
            }),
          }
        );
        results.push({ group_id: group.id, group_name: group.group_name, success: true });
      } else {
        // "user not found" or "user is an administrator" aren't real failures
        const desc = banData.description ?? "";
        const isNotInGroup = desc.includes("user not found") || desc.includes("USER_NOT_PARTICIPANT");
        results.push({
          group_id: group.id,
          group_name: group.group_name,
          success: isNotInGroup, // Not in group = already removed, count as success
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

  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logRemoval(supabase: any, user: any, telegramUserId: number, memberName: string | undefined, results: Array<{ group_id: string; group_name: string; success: boolean; error?: string }>) {
  const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";
  const successCount = results.filter((r) => r.success).length;

  await logAudit({
    action: "nuclear_remove",
    entityType: "tg_member",
    entityId: String(telegramUserId),
    actorId: user.id,
    actorName: userName,
    details: {
      telegram_user_id: telegramUserId,
      member_name: memberName ?? "Unknown",
      groups_attempted: results.length,
      groups_removed: successCount,
      groups_failed: results.length - successCount,
      failed_groups: results.filter((r) => !r.success && r.error).map((r) => ({ name: r.group_name, error: r.error })),
    },
  });
}
