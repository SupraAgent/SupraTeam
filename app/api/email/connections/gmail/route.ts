import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireAuth } from "@/lib/auth-guard";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002"}/api/email/callback/gmail`
  );
}

/** POST: Initiate Gmail OAuth flow — returns the authorization URL */
export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 503 }
    );
  }

  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: Buffer.from(JSON.stringify({ uid: auth.user.id, ts: Date.now(), nonce: crypto.randomUUID() })).toString("base64url"),
  });

  return NextResponse.json({ url, source: "google" });
}
