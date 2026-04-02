import { Bot } from "grammy";
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

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

const bot = new Bot(token);

// Register handlers
registerCommands(bot);
registerGroupHandlers(bot);
registerMessageHandlers(bot);
registerDripTriggers(bot);
registerCallbackHandler(bot);
registerInlineHandler(bot);
registerJoinRequestHandler(bot);

// Start notification poller (stage changes -> TG messages)
startNotificationPoller(bot);

// Start outreach sequence worker (sends TG messages on schedule)
startOutreachWorker(bot);

// Start drip sequence worker (processes bot-initiated drip enrollments)
startDripWorker(bot);

// Start SLA response time poller (warns/escalates on overdue responses)
startSlaPoller(bot);

// Error handler
bot.catch((err) => {
  console.error("[bot] Error:", err.message);
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
