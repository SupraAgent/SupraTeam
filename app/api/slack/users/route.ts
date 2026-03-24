import { NextResponse } from "next/server";
import { getSlackToken, getSlackUsers } from "@/lib/slack";

export async function GET() {
  const token = await getSlackToken();
  if (!token) {
    return NextResponse.json({ error: "Slack not connected" }, { status: 400 });
  }

  const users = await getSlackUsers(token);
  return NextResponse.json({ data: users });
}
