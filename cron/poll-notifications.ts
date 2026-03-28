/**
 * Railway cron job: Process retries, scheduled messages, workflow resumes, reminders.
 * Schedule: every 5 minutes
 *
 * NOTE: Stage change notifications are handled by the bot process (bot/handlers/notifications.ts).
 * This cron only handles retry/scheduled/workflow/reminder jobs.
 */

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL;
if (!APP_URL) {
  console.error("[poll-notifications] NEXT_PUBLIC_SITE_URL not set");
  process.exit(1);
}

async function main() {
  console.log("[poll-notifications] Starting...");

  // 1. Process failed notification retries (rate-limited, with tracking)
  try {
    const { processRetries } = await import("../lib/telegram-send");
    const retried = await processRetries();
    if (retried > 0) console.log(`[poll-notifications] Retried ${retried} failed notifications`);
  } catch (err) {
    console.error("[poll-notifications] Retry error:", err);
  }

  // 2. Process scheduled messages (rate-limited, with tracking)
  try {
    const { processScheduledMessages } = await import("../lib/telegram-send");
    const sent = await processScheduledMessages();
    if (sent > 0) console.log(`[poll-notifications] Sent ${sent} scheduled messages`);
  } catch (err) {
    console.error("[poll-notifications] Scheduled message error:", err);
  }

  // 3. Resume paused workflows (delay nodes)
  try {
    const resumeRes = await fetch(`${APP_URL}/api/workflows/resume`, { method: "POST" });
    if (resumeRes.ok) {
      const data = await resumeRes.json();
      if (data.resumed > 0) console.log(`[poll-notifications] Resumed ${data.resumed} workflow runs`);
      if (data.failed > 0) console.log(`[poll-notifications] ${data.failed} workflow resumes failed`);
    }
  } catch (err) {
    console.error("[poll-notifications] Workflow resume error:", err);
  }

  // 4. Auto-generate reminders
  try {
    const reminderRes = await fetch(`${APP_URL}/api/reminders`, { method: "POST" });
    if (reminderRes.ok) {
      const data = await reminderRes.json();
      console.log(`[poll-notifications] Generated ${data.generated ?? 0} reminders`);
    }
  } catch (err) {
    console.error("[poll-notifications] Reminder generation error:", err);
  }

  console.log("[poll-notifications] Done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[poll-notifications] Fatal error:", err);
  process.exit(1);
});
