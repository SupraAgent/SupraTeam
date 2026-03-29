import { NextResponse } from "next/server";
import { getSlackToken, sendSlackMessage } from "@/lib/slack";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const token = await getSlackToken();
  if (!token) {
    return NextResponse.json({ error: "Slack not connected" }, { status: 400 });
  }

  const { channel, message } = await request.json();
  if (!channel || !message) {
    return NextResponse.json({ error: "channel and message required" }, { status: 400 });
  }

  const result = await sendSlackMessage(token, channel, message);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ts: result.ts });
}
