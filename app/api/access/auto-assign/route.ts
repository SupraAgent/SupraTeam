/**
 * POST /api/access/auto-assign — Auto-add a user to all groups matching a slug tag
 * When a new BD rep joins, auto-add them to all "bd"-tagged groups.
 * Also stores the auto-assign rule so future groups with that tag auto-include them.
 *
 * DELETE /api/access/auto-assign — Remove auto-assign rule and optionally kick from tagged groups
 */
import { NextResponse } from "next/server";
import { requireLeadRole } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

const SLUG_REGEX = /^[a-z0-9_-]{1,50}$/;

export async function POST(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

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

  const { user_id, slug, auto_add_to_existing } = body;

  if (!user_id || !slug) {
    return NextResponse.json({ error: "user_id and slug required" }, { status: 400 });
  }

  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json({ error: "Invalid slug format (lowercase alphanumeric, hyphens, underscores, max 50 chars)" }, { status: 400 });
  }

  // Get target user's telegram_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_id")
    .eq("id", user_id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!profile.telegram_id) {
    return NextResponse.json({ error: "User has no Telegram ID linked" }, { status: 400 });
  }

  // Grant slug access (upsert)
  await supabase.from("crm_user_slug_access").upsert({
    user_id,
    slug,
    granted_by: user.id,
    granted_at: new Date().toISOString(),
  }, { onConflict: "user_id,slug" });

  // If auto_add_to_existing, create invite links for all matching groups
  const results: Array<{ group_name: string; success: boolean; invite_link?: string; error?: string }> = [];

  if (auto_add_to_existing) {
    const { data: slugGroups } = await supabase
      .from("tg_group_slugs")
      .select("group:tg_groups(id, telegram_group_id, group_name, bot_is_admin)")
      .eq("slug", slug);

    if (slugGroups) {
      for (const sg of slugGroups) {
        const group = sg.group as unknown as { id: string; telegram_group_id: number; group_name: string; bot_is_admin: boolean } | null;
        if (!group?.bot_is_admin) {
          if (group) results.push({ group_name: group.group_name, success: false, error: "Bot not admin" });
          continue;
        }

        try {
          const res = await fetch(
            `https://api.telegram.org/bot${botToken}/createChatInviteLink`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: group.telegram_group_id,
                member_limit: 1,
                name: `Auto-assign: ${profile.display_name ?? user_id} (${slug})`,
              }),
            }
          );
          const data = await res.json();
          if (data.ok) {
            results.push({ group_name: group.group_name, success: true, invite_link: data.result.invite_link });
          } else {
            results.push({ group_name: group.group_name, success: false, error: data.description });
          }
        } catch (err) {
          results.push({
            group_name: group.group_name,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    }
  }

  // Audit log
  const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";
  await logAudit({
    action: "auto_assign",
    entityType: "access",
    entityId: slug,
    actorId: user.id,
    actorName: userName,
    details: {
      target_user_id: user_id,
      target_name: profile.display_name,
      slug,
      auto_add_to_existing,
      groups_added: results.filter((r) => r.success).length,
      total_groups: results.length,
    },
  });

  return NextResponse.json({
    ok: true,
    slug,
    results,
    invite_links: results.filter((r) => r.success && r.invite_link).map((r) => ({
      group_name: r.group_name,
      invite_link: r.invite_link,
    })),
  });
}

export async function DELETE(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const slug = searchParams.get("slug");
  const alsoRemove = searchParams.get("remove_from_groups") === "true";

  if (!userId || !slug) {
    return NextResponse.json({ error: "user_id and slug required" }, { status: 400 });
  }

  // Remove slug access
  await supabase
    .from("crm_user_slug_access")
    .delete()
    .eq("user_id", userId)
    .eq("slug", slug);

  let removedCount = 0;

  // Optionally also kick from all tagged groups
  if (alsoRemove) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("telegram_id")
        .eq("id", userId)
        .single();

      if (profile?.telegram_id) {
        const { data: slugGroups } = await supabase
          .from("tg_group_slugs")
          .select("group:tg_groups(telegram_group_id, bot_is_admin)")
          .eq("slug", slug);

        if (slugGroups) {
          for (const sg of slugGroups) {
            const group = sg.group as unknown as { telegram_group_id: number; bot_is_admin: boolean } | null;
            if (!group?.bot_is_admin) continue;

            try {
              const banRes = await fetch(`https://api.telegram.org/bot${botToken}/banChatMember`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: group.telegram_group_id, user_id: profile.telegram_id }),
              });
              const banData = await banRes.json();
              if (banData.ok) {
                await fetch(`https://api.telegram.org/bot${botToken}/unbanChatMember`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: group.telegram_group_id, user_id: profile.telegram_id, only_if_banned: true }),
                });
                removedCount++;
              }
            } catch (err) {
              console.error("[auto-assign] Remove from group failed:", err);
            }
          }
        }
      }
    }
  }

  const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";
  await logAudit({
    action: "auto_assign_revoked",
    entityType: "access",
    entityId: slug,
    actorId: user.id,
    actorName: userName,
    details: { target_user_id: userId, slug, also_removed: alsoRemove, removed_count: removedCount },
  });

  return NextResponse.json({ ok: true, removed_count: removedCount });
}
