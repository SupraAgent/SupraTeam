import { NextResponse } from "next/server";
import { getAllActiveBots, getDefaultBot } from "@/lib/bot-registry";

export async function POST(request: Request) {
  const { botId } = await request.json().catch(() => ({ botId: null }));
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_SITE_URL not set" }, { status: 503 });
  }

  // If botId specified, set up just that bot. Otherwise set up all active bots.
  const bots = botId
    ? [await (async () => {
        const { getBotById } = await import("@/lib/bot-registry");
        return getBotById(botId);
      })()].filter(Boolean)
    : await getAllActiveBots();

  // Fallback to env var if no registered bots
  if (bots.length === 0) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return NextResponse.json({ error: "No bots configured" }, { status: 503 });

    const webhookUrl = `${baseUrl}/api/bot/webhook`;
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "my_chat_member"], drop_pending_updates: true }),
    });
    const data = await res.json();
    return data.ok
      ? NextResponse.json({ ok: true, webhook_url: webhookUrl, bots_configured: 1 })
      : NextResponse.json({ ok: false, error: data.description ?? "Failed" }, { status: 500 });
  }

  const results = [];
  for (const bot of bots) {
    if (!bot) continue;
    const webhookUrl = `${baseUrl}/api/bot/webhook/${bot.id}`;
    await fetch(`https://api.telegram.org/bot${bot.token}/deleteWebhook`);
    const res = await fetch(`https://api.telegram.org/bot${bot.token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "my_chat_member"], drop_pending_updates: true }),
    });
    const data = await res.json();
    results.push({ bot_id: bot.id, label: bot.label, username: bot.bot_username, ok: data.ok, webhook_url: webhookUrl });
  }

  return NextResponse.json({ ok: results.every((r) => r.ok), bots: results, bots_configured: results.length });
}

// GET — check webhook status for default bot or all bots
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const botId = searchParams.get("botId");

  if (botId) {
    const { getBotById } = await import("@/lib/bot-registry");
    const bot = await getBotById(botId);
    if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    const res = await fetch(`https://api.telegram.org/bot${bot.token}/getWebhookInfo`);
    const data = await res.json();
    return NextResponse.json({ bot_id: bot.id, label: bot.label, ...(data.result ?? data) });
  }

  // Default: check default bot or env fallback
  const defaultBot = await getDefaultBot();
  if (!defaultBot) return NextResponse.json({ error: "No bot configured" }, { status: 503 });
  const res = await fetch(`https://api.telegram.org/bot${defaultBot.token}/getWebhookInfo`);
  const data = await res.json();
  return NextResponse.json(data.result ?? data);
}
