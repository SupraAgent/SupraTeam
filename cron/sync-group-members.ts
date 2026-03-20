/**
 * Railway cron job: Sync member counts for all non-archived Telegram groups.
 * Schedule: every 30 minutes (or as configured)
 * Calls Telegram Bot API getChatMemberCount for each group.
 * Rate-limited to avoid Telegram throttling (100ms delay between calls).
 */
import { createClient } from "@supabase/supabase-js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[sync-group-members] Missing required env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[sync-group-members] Starting...");

  // Get all non-archived groups
  const { data: groups, error } = await supabase
    .from("tg_groups")
    .select("id, telegram_group_id")
    .eq("is_archived", false);

  if (error) {
    console.error("[sync-group-members] Query error:", error);
    process.exit(1);
  }

  if (!groups || groups.length === 0) {
    console.log("[sync-group-members] No groups to sync");
    process.exit(0);
  }

  console.log(`[sync-group-members] Syncing ${groups.length} groups...`);

  let updated = 0;
  let errors = 0;

  for (const group of groups) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getChatMemberCount?chat_id=${group.telegram_group_id}`
      );
      const data = await res.json();

      if (data.ok) {
        const { error: updateError } = await supabase
          .from("tg_groups")
          .update({
            member_count: data.result,
            last_bot_check_at: new Date().toISOString(),
          })
          .eq("id", group.id);

        if (!updateError) {
          updated++;
        } else {
          console.error(
            `[sync-group-members] Update error for ${group.telegram_group_id}:`,
            updateError
          );
          errors++;
        }
      } else {
        console.warn(
          `[sync-group-members] Telegram API error for ${group.telegram_group_id}:`,
          data.description
        );
        errors++;
      }
    } catch (err) {
      console.error(
        `[sync-group-members] Fetch error for ${group.telegram_group_id}:`,
        err
      );
      errors++;
    }

    // Rate limit: 100ms between calls
    await delay(100);
  }

  console.log(
    `[sync-group-members] Done. Updated: ${updated}, Errors: ${errors}, Total: ${groups.length}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[sync-group-members] Fatal error:", err);
  process.exit(1);
});
