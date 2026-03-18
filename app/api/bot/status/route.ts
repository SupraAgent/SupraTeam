import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, connected: false, error: "Bot token not configured" });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({ ok: false, connected: false, error: "Invalid bot token" });
    }

    // Count groups
    const supabase = createSupabaseAdmin();
    let groups = 0;
    if (supabase) {
      const { count } = await supabase
        .from("tg_groups")
        .select("id", { count: "exact", head: true })
        .eq("bot_is_admin", true);
      groups = count ?? 0;
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      result: data.result,
      groups,
    });
  } catch {
    return NextResponse.json({ ok: false, connected: false, error: "Failed to reach Telegram API" });
  }
}
