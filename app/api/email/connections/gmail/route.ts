import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createHmac } from "crypto";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002"}/api/email/callback/gmail`
  );
}

/** Sign the OAuth state payload with HMAC-SHA256 */
function signState(payload: Record<string, unknown>): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const data = JSON.stringify(payload);
  const sig = createHmac("sha256", key).update(data).digest("base64url");
  return Buffer.from(JSON.stringify({ d: data, s: sig })).toString("base64url");
}

/** Verify and extract the HMAC-signed OAuth state */
export function verifyState(state: string): Record<string, unknown> | null {
  try {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) return null;
    const { d, s } = JSON.parse(Buffer.from(state, "base64url").toString());
    const expected = createHmac("sha256", key).update(d).digest("base64url");
    if (s !== expected) return null;
    return JSON.parse(d);
  } catch {
    return null;
  }
}

/** POST: Initiate Gmail OAuth flow — returns the authorization URL */
export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rl = rateLimit(`oauth-init:${auth.user.id}`, { max: 5, windowSec: 60 });
  if (rl) return rl;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Google OAuth not configured" },
      { status: 503 }
    );
  }

  const nonce = crypto.randomUUID();
  const state = signState({ uid: auth.user.id, ts: Date.now(), nonce });

  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });

  return NextResponse.json({ url, source: "google" });
}
