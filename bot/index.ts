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

// Set bot command menu
bot.api.setMyCommands([
  { command: "start", description: "Start the bot and get help" },
  { command: "deals", description: "View your active deals" },
  { command: "pipeline", description: "Pipeline summary" },
  { command: "help", description: "Show available commands" },
]).catch((err) => console.error("[bot] Failed to set commands:", err.message));

// Start long-polling
console.log("[bot] Starting SupraCRM bot...");
bot.start({
  onStart: (botInfo) => {
    console.log(`[bot] Connected as @${botInfo.username} (${botInfo.id})`);
  },
});
