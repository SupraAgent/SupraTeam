/**
 * Next.js instrumentation hook — runs once on server startup.
 * On Railway, this fires when the service starts/restarts.
 *
 * Used to:
 * 1. Auto-register Telegram webhook (so deploys "just work")
 * 2. Log startup diagnostics
 */
export async function register() {
  // Only run on the server (not during build)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[startup] SupraTeam starting...");
    console.log(`[startup] Environment: ${process.env.RAILWAY_ENVIRONMENT ?? "local"}`);
    console.log(`[startup] Node.js ${process.version}, uptime: ${process.uptime().toFixed(1)}s`);

    // Auto-setup Telegram webhook on Railway deploy
    // NOTE: When webhook is active, the bot/ long-polling process must NOT run.
    // Set USE_WEBHOOK=true in production. In dev, leave unset and use bot/index.ts polling.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const useWebhook = process.env.USE_WEBHOOK === "true" || !!process.env.RAILWAY_ENVIRONMENT;

    if (baseUrl && botToken && useWebhook) {
      // Delay slightly to let the HTTP server bind first
      setTimeout(async () => {
        try {
          const webhookUrl = `${baseUrl}/api/bot/webhook`;
          const payload: Record<string, unknown> = {
            url: webhookUrl,
            allowed_updates: ["message", "my_chat_member", "chat_member", "callback_query", "inline_query", "chat_join_request"],
            drop_pending_updates: false,
          };

          const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
          if (webhookSecret) {
            payload.secret_token = webhookSecret;
          }

          const res = await fetch(
            `https://api.telegram.org/bot${botToken}/setWebhook`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          );
          const data = await res.json();

          if (data.ok) {
            console.log(`[startup] Telegram webhook set: ${webhookUrl}`);
          } else {
            console.warn(`[startup] Telegram webhook failed: ${data.description}`);
          }
        } catch (err) {
          console.warn("[startup] Telegram webhook setup error:", err);
        }
      }, 3000);
    } else {
      if (!botToken) console.log("[startup] TELEGRAM_BOT_TOKEN not set, skipping webhook");
      if (!baseUrl) console.log("[startup] NEXT_PUBLIC_SITE_URL not set, skipping webhook");
    }
  }
}
