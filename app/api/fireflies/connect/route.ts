import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";
import { validateFirefliesApiKey, storeFirefliesConnection } from "@/lib/fireflies/client";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const rl = rateLimit(`fireflies-connect:${user.id}`, { max: 5, windowSec: 60 });
  if (rl) return rl;

  try {
    const body = await request.json();
    const apiKey = (body.apiKey as string)?.trim();

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    // Validate the API key by fetching user profile
    const firefliesUser = await validateFirefliesApiKey(apiKey);

    // Generate webhook secret for HMAC verification
    const webhookSecret = randomBytes(32).toString("hex");

    // Store encrypted connection
    await storeFirefliesConnection(user.id, apiKey, firefliesUser, webhookSecret);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
    const webhookUrl = `${appUrl}/api/webhooks/fireflies?uid=${user.id}`;

    return NextResponse.json({
      data: {
        email: firefliesUser.email,
        name: firefliesUser.name,
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
      },
      source: "fireflies",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
