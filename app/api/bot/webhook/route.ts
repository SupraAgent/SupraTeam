import { NextResponse } from "next/server";
import { getBot } from "@/lib/bot";

export async function POST(request: Request) {
  const bot = getBot();
  if (!bot) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }

  try {
    const update = await request.json();
    await bot.handleUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error:", err);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
