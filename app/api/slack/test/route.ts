import { NextResponse } from "next/server";
import { getSlackToken, sendSlackMessage } from "@/lib/slack";

export async function POST(request: Request) {
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
