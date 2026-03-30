/**
 * GET /api/cron/revoke-expired-access
 * Cron job: auto-revoke expired slug access grants.
 * Finds grants where expires_at < now and auto_revoked_at IS NULL,
 * marks them as revoked, removes users from TG groups, and logs the action.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { verifyCron } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Find expired grants that haven't been auto-revoked yet
  const { data: expired, error } = await supabase
    .from("crm_user_slug_access")
    .select("id, user_id, slug, expires_at")
    .lt("expires_at", new Date().toISOString())
    .is("auto_revoked_at", null);

  if (error) {
    console.error("[cron/revoke-expired] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ revoked: 0 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  let revokedCount = 0;

  for (const grant of expired) {
    try {
      // Attempt to remove user from TG groups first, then mark as revoked
      let removedFromAnyGroup = false;

      if (botToken) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("telegram_id, display_name")
          .eq("id", grant.user_id)
          .single();

        if (profile?.telegram_id) {
          const { data: slugGroups } = await supabase
            .from("tg_group_slugs")
            .select("group:tg_groups(telegram_group_id, group_name, bot_is_admin)")
            .eq("slug", grant.slug);

          for (const sg of slugGroups ?? []) {
            const group = sg.group as unknown as { telegram_group_id: number; group_name: string; bot_is_admin: boolean } | null;
            if (!group?.bot_is_admin) continue;

            try {
              // Ban then unban (kick without permanent ban)
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
                removedFromAnyGroup = true;
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
              }
            } catch (groupErr) {
              console.error("[cron/revoke-expired] group removal error:", group.group_name, groupErr instanceof Error ? groupErr.message : groupErr);
            }
          }
        }
      }

      // Mark as auto-revoked (even if no TG groups — the DB grant still expires)
      await supabase
        .from("crm_user_slug_access")
        .update({
          auto_revoked_at: new Date().toISOString(),
          revoke_reason: "expired",
        })
        .eq("id", grant.id);

      // Log the auto-revoke
      await logAudit({
        action: "auto_revoke",
        entityType: "access",
        entityId: grant.slug,
        actorId: "system",
        actorName: "Auto-Revoke Cron",
        details: {
          user_id: grant.user_id,
          slug: grant.slug,
          expires_at: grant.expires_at,
          reason: "expired",
        },
      });

      revokedCount++;
    } catch (err) {
      console.error("[cron/revoke-expired] error revoking grant:", grant.id, err);
    }
  }

  return NextResponse.json({ revoked: revokedCount, total_expired: expired.length });
}
