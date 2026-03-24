import { Bot } from "grammy";
import { registerCommands } from "./handlers/commands.js";
import { registerGroupHandlers } from "./handlers/groups.js";
import { registerMessageHandlers } from "./handlers/messages.js";
import { startNotificationPoller } from "./handlers/notifications.js";
import { startOutreachWorker } from "./outreach-worker.js";

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

// Start notification poller (stage changes -> TG messages)
startNotificationPoller(bot);

// Start outreach sequence worker (sends TG messages on schedule)
startOutreachWorker(bot);

// Error handler
bot.catch((err) => {
  console.error("[bot] Error:", err.message);
});

// Start long-polling
console.log("[bot] Starting SupraCRM bot...");
bot.start({
  onStart: (botInfo) => {
    console.log(`[bot] Connected as @${botInfo.username} (${botInfo.id})`);
  },
});
