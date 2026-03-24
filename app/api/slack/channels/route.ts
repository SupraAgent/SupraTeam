import { NextResponse } from "next/server";
import { getSlackToken, getSlackChannels } from "@/lib/slack";

export async function GET() {
  const token = await getSlackToken();
  if (!token) {
    return NextResponse.json({ error: "Slack not connected" }, { status: 400 });
  }

  const channels = await getSlackChannels(token);
  return NextResponse.json({ data: channels });
}
