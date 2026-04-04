import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";

const CALENDLY_SCOPES = "default";

export function getCalendlyOAuth2Url(state: string): string {
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !appUrl) throw new Error("Calendly OAuth not configured");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/calendly/callback`,
    response_type: "code",
    state,
  });

  return `https://auth.calendly.com/oauth/authorize?${params}`;
}

/** Sign the OAuth state payload with HMAC-SHA256 */
export function signCalendlyState(payload: Record<string, unknown>): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const data = JSON.stringify(payload);
  const sig = createHmac("sha256", key).update(data).digest("base64url");
  return Buffer.from(JSON.stringify({ d: data, s: sig })).toString("base64url");
}

/** Verify and extract the HMAC-signed OAuth state */
export function verifyCalendlyState(state: string): Record<string, unknown> | null {
  try {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) return null;
    const { d, s } = JSON.parse(Buffer.from(state, "base64url").toString());
    const expected = createHmac("sha256", key).update(d).digest("base64url");
    const a = Buffer.from(s);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(d);
  } catch {
    return null;
  }
}

/** POST: Initiate Calendly OAuth flow — returns the authorization URL */
export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rl = rateLimit(`calendly-oauth-init:${auth.user.id}`, { max: 5, windowSec: 60 });
  if (rl) return rl;

  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Calendly OAuth not configured" },
      { status: 503 }
    );
  }

  const nonce = crypto.randomUUID();
  const state = signCalendlyState({
    uid: auth.user.id,
    ts: Date.now(),
    nonce,
    type: "calendly",
  });

  const url = getCalendlyOAuth2Url(state);

  return NextResponse.json({ url, source: "calendly" });
}
