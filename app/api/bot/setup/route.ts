import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 503 });
  }

  // Determine webhook URL
  const { url } = await request.json().catch(() => ({ url: null }));
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url && !baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_SITE_URL not set" }, { status: 503 });
  }
  const webhookUrl = url || `${baseUrl}/api/bot/webhook`;

  // Delete any existing webhook first
  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);

  // Set new webhook with optional secret token for verification
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const webhookPayload: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message", "my_chat_member"],
    drop_pending_updates: true,
  };
  if (webhookSecret) {
    webhookPayload.secret_token = webhookSecret;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  });

  const data = await res.json();

  if (data.ok) {
    return NextResponse.json({
      ok: true,
      webhook_url: webhookUrl,
      message: "Webhook set successfully",
    });
  }

  return NextResponse.json({
    ok: false,
    error: data.description ?? "Failed to set webhook",
  }, { status: 500 });
}

// GET to check current webhook status
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 503 });
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const data = await res.json();

  return NextResponse.json(data.result ?? data);
}
