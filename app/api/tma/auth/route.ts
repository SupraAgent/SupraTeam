import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/tma/auth
 * Validates Telegram Mini App initData using HMAC-SHA256.
 * Returns the authenticated user data if valid.
 *
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  let body: { initData?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { initData } = body;
  if (!initData || typeof initData !== "string") {
    return NextResponse.json({ error: "initData is required" }, { status: 400 });
  }

  // Parse initData query string
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return NextResponse.json({ error: "Missing hash in initData" }, { status: 400 });
  }

  // Build the data-check-string (sorted key=value pairs, excluding hash)
  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  // HMAC-SHA256 validation per Telegram docs
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) {
    return NextResponse.json({ error: "Invalid initData signature" }, { status: 401 });
  }

  // Check auth_date is present and not too old (5 minutes max)
  const authDate = params.get("auth_date");
  if (!authDate) {
    return NextResponse.json({ error: "Missing auth_date in initData" }, { status: 400 });
  }
  const authTimestamp = parseInt(authDate, 10);
  if (isNaN(authTimestamp)) {
    return NextResponse.json({ error: "Invalid auth_date" }, { status: 400 });
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - authTimestamp > 300) {
    return NextResponse.json({ error: "initData expired" }, { status: 401 });
  }

  // Parse user data
  const userRaw = params.get("user");
  if (!userRaw) {
    return NextResponse.json({ error: "No user data in initData" }, { status: 400 });
  }

  let user: { id: number; first_name: string; last_name?: string; username?: string };
  try {
    user = JSON.parse(userRaw);
  } catch {
    return NextResponse.json({ error: "Invalid user data" }, { status: 400 });
  }

  return NextResponse.json({
    valid: true,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
    },
  });
}
