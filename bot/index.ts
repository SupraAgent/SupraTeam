import { Bot, GrammyError, HttpError } from "grammy";
import { registerCommands } from "./handlers/commands.js";
import { registerGroupHandlers } from "./handlers/groups.js";
import { registerMessageHandlers } from "./handlers/messages.js";
import { registerDripTriggers } from "./handlers/drip-triggers.js";
import { startNotificationPoller } from "./handlers/notifications.js";
import { startOutreachWorker } from "./outreach-worker.js";
import { startDripWorker } from "./drip-worker.js";
import { startSlaPoller } from "./handlers/sla-poller.js";
import { registerCallbackHandler } from "./handlers/callback-actions.js";
import { registerInlineHandler } from "./handlers/inline-query.js";
import { registerJoinRequestHandler } from "./handlers/join-requests.js";
import { registerQrStartHandler } from "./handlers/qr-start.js";
import { registerSequenceTriggers } from "./handlers/sequence-triggers.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

const bot = new Bot(token);

// Auto-retry transformer: retries on 429 (flood wait) with exponential backoff
bot.api.config.use(async (prev, method, payload, signal) => {
  const MAX_RETRIES = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prev(method, payload, signal);
    } catch (err) {
      lastError = err;
      if (err instanceof GrammyError && err.error_code === 429) {
        const retryAfter = (err.parameters as { retry_after?: number })?.retry_after ?? (2 ** attempt);
        const waitMs = Math.min(retryAfter * 1000, 60_000);
        console.warn(`[bot] 429 flood wait on ${method}, retry ${attempt + 1}/${MAX_RETRIES} after ${waitMs}ms`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
});

// Register handlers
registerQrStartHandler(bot); // Must be before registerCommands to intercept /start qr_*
registerCommands(bot);
registerGroupHandlers(bot);
registerMessageHandlers(bot);
registerDripTriggers(bot);
registerCallbackHandler(bot);
registerInlineHandler(bot);
registerJoinRequestHandler(bot);
registerSequenceTriggers(bot);

// Start notification poller (stage changes -> TG messages)
startNotificationPoller(bot);

// Start outreach sequence worker (sends TG messages on schedule)
startOutreachWorker(bot);

// Start drip sequence worker (processes bot-initiated drip enrollments)
startDripWorker(bot);

// Start SLA response time poller (warns/escalates on overdue responses)
startSlaPoller(bot);

// Error handler with Telegram error discrimination
bot.catch(async (err) => {
  const e = err.error;
  if (e instanceof GrammyError) {
    const chatId = err.ctx?.chat?.id;

    // 403: Bot was blocked by the user or kicked from group
    if (e.error_code === 403) {
      console.warn(`[bot] 403 blocked/kicked — chat ${chatId}: ${e.description}`);
      if (chatId) {
        try {
          // Mark contact as blocked if it's a private chat
          const { createClient } = await import("@supabase/supabase-js");
          const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );
          // Check if this is a user's TG ID
          const { data: contact } = await admin
            .from("crm_contacts")
            .select("id, notes")
            .eq("telegram_user_id", chatId)
            .maybeSingle();
          if (contact) {
            const existingNotes = (contact.notes as string) ?? "";
            const blockedTag = "[BOT BLOCKED]";
            const updatedNotes = existingNotes.includes(blockedTag)
              ? existingNotes
              : (existingNotes ? existingNotes + "\n" + blockedTag : blockedTag);
            await admin.from("crm_contacts").update({ notes: updatedNotes }).eq("id", contact.id);
            console.warn(`[bot] Marked contact ${contact.id} as bot-blocked`);
          }
          // Mark group as removed if it's a group
          await admin.from("tg_groups")
            .update({ bot_is_admin: false })
            .eq("telegram_group_id", String(chatId));
        } catch (dbErr) {
          console.error("[bot] Failed to update blocked status:", dbErr);
        }
      }
      return;
    }

    // 400: Chat not found or bad request
    if (e.error_code === 400 && e.description.includes("chat not found")) {
      console.warn(`[bot] Chat not found: ${chatId}`);
      return;
    }

    // 429: Should be handled by auto-retry transformer, but log if it gets here
    if (e.error_code === 429) {
      console.error(`[bot] 429 flood wait exhausted retries: ${e.description}`);
      return;
    }

    console.error(`[bot] GrammyError ${e.error_code}: ${e.description}`);
  } else if (e instanceof HttpError) {
    console.error(`[bot] HttpError: ${e.message}`);
  } else {
    console.error("[bot] Unknown error:", e);
  }
});

// Set bot command menus — scoped by chat type
Promise.all([
  // Private chat commands
  bot.api.setMyCommands([
    { command: "start", description: "Start the bot and get help" },
    { command: "deals", description: "View your active deals" },
    { command: "pipeline", description: "Pipeline summary" },
    { command: "status", description: "Bot status and stats" },
    { command: "help", description: "Show available commands" },
  ], { scope: { type: "all_private_chats" } }),
  // Group commands
  bot.api.setMyCommands([
    { command: "contact", description: "Show your Supra point of contact" },
    { command: "help", description: "Show available commands" },
  ], { scope: { type: "all_group_chats" } }),
]).catch((err) => console.error("[bot] Failed to set commands:", err.message));

// Set persistent menu button for TMA (Mini App) access in private chats
const tmaUrl = process.env.NEXT_PUBLIC_SITE_URL;
if (tmaUrl) {
  bot.api.setChatMenuButton({
    menu_button: {
      type: "web_app",
      text: "Open CRM",
      web_app: { url: `${tmaUrl}/tma` },
    },
  }).catch((err) => console.error("[bot] Failed to set menu button:", err.message));
}

// Start long-polling
console.log("[bot] Starting SupraTeam bot...");
bot.start({
  allowed_updates: ["message", "my_chat_member", "chat_member", "callback_query", "inline_query", "chat_join_request"],
  onStart: (botInfo) => {
    console.log(`[bot] Connected as @${botInfo.username} (${botInfo.id})`);
  },
});
