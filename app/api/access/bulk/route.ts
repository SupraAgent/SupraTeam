import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();
  const { action, user_id, slug } = body;

  if (!action || !user_id || !slug) {
    return NextResponse.json({ error: "action, user_id, and slug are required" }, { status: 400 });
  }

  if (!["add_to_groups", "remove_from_groups"].includes(action)) {
    return NextResponse.json({ error: "action must be 'add_to_groups' or 'remove_from_groups'" }, { status: 400 });
  }

  // Find all groups with the given slug
  const { data: slugGroups, error: slugError } = await supabase
    .from("tg_group_slugs")
    .select("slug, group_id, group:tg_groups(id, telegram_group_id, group_name, bot_is_admin)")
    .eq("slug", slug);

  if (slugError) {
    console.error("[api/access/bulk] slug lookup error:", slugError);
    return NextResponse.json({ error: "Failed to find groups for slug" }, { status: 500 });
  }

  if (!slugGroups || slugGroups.length === 0) {
    return NextResponse.json({ error: "No groups found with this slug" }, { status: 404 });
  }

  // Get the target user's telegram_id from profiles
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_id")
    .eq("id", user_id)
    .single();

  if (profileError || !profile) {
    console.error("[api/access/bulk] profile lookup error:", profileError);
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!profile.telegram_id) {
    return NextResponse.json({ error: "User has no Telegram ID linked" }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Telegram bot token not configured" }, { status: 503 });
  }

  const results: Array<{
    group_id: string;
    group_name: string;
    telegram_group_id: number;
    success: boolean;
    invite_link?: string;
    error?: string;
  }> = [];

  for (const sg of slugGroups) {
    const groupData = sg.group as unknown as { id: string; telegram_group_id: number; group_name: string; bot_is_admin: boolean } | null;
    const group = groupData;
    if (!group) continue;

    try {
      if (action === "add_to_groups") {
        // Create a one-time invite link for the group
        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/createChatInviteLink`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: group.telegram_group_id,
              member_limit: 1,
              name: `Access for ${profile.display_name ?? user_id}`,
            }),
          }
        );
        const data = await res.json();

        if (data.ok) {
          results.push({
            group_id: group.id,
            group_name: group.group_name,
            telegram_group_id: group.telegram_group_id,
            success: true,
            invite_link: data.result.invite_link,
          });
        } else {
          results.push({
            group_id: group.id,
            group_name: group.group_name,
            telegram_group_id: group.telegram_group_id,
            success: false,
            error: data.description ?? "Telegram API error",
          });
        }
      } else {
        // remove_from_groups: ban then unban (kick without permanent ban)
        const banRes = await fetch(
          `https://api.telegram.org/bot${botToken}/banChatMember`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: group.telegram_group_id,
              user_id: profile.telegram_id,
            }),
          }
        );
        const banData = await banRes.json();

        if (banData.ok) {
          // Immediately unban so they can rejoin later
          await fetch(
            `https://api.telegram.org/bot${botToken}/unbanChatMember`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: group.telegram_group_id,
                user_id: profile.telegram_id,
                only_if_banned: true,
              }),
            }
          );

          results.push({
            group_id: group.id,
            group_name: group.group_name,
            telegram_group_id: group.telegram_group_id,
            success: true,
          });
        } else {
          results.push({
            group_id: group.id,
            group_name: group.group_name,
            telegram_group_id: group.telegram_group_id,
            success: false,
            error: banData.description ?? "Telegram API error",
          });
        }
      }
    } catch (err) {
      results.push({
        group_id: group.id,
        group_name: group.group_name,
        telegram_group_id: group.telegram_group_id,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Determine overall status
  const allSuccess = results.every((r) => r.success);
  const allFailed = results.every((r) => !r.success);
  const status = allSuccess ? "success" : allFailed ? "failed" : "partial_failure";

  const errorLog = results
    .filter((r) => !r.success)
    .map((r) => `${r.group_name}: ${r.error}`)
    .join("; ");

  // Log the operation
  await supabase.from("crm_slug_access_log").insert({
    action,
    target_user_id: user_id,
    slug,
    groups_affected: results.map((r) => ({
      group_id: r.group_id,
      group_name: r.group_name,
      success: r.success,
    })),
    performed_by: user.id,
    status,
    error_log: errorLog || null,
    created_at: new Date().toISOString(),
  });

  // Centralized audit log
  const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";
  await logAudit({
    action: action === "add_to_groups" ? "bulk_add" : "bulk_remove",
    entityType: "access",
    entityId: slug,
    actorId: user.id,
    actorName: userName,
    details: {
      target_user_id: user_id,
      target_name: profile.display_name,
      slug,
      groups_count: results.length,
      success_count: results.filter((r) => r.success).length,
      status,
    },
  });

  const inviteLinks = action === "add_to_groups"
    ? results.filter((r) => r.success && r.invite_link).map((r) => ({
        group_name: r.group_name,
        invite_link: r.invite_link,
      }))
    : undefined;

  return NextResponse.json({ ok: allSuccess || !allFailed, status, results, invite_links: inviteLinks });
}
