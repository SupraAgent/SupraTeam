import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ connected: false, reason: "No bot token configured" });
  }

  try {
    // Call Telegram getMe to verify the token
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({ connected: false, reason: "Invalid bot token" });
    }

    // Count groups
    const { count } = await supabase
      .from("tg_groups")
      .select("id", { count: "exact", head: true })
      .eq("bot_is_admin", true);

    return NextResponse.json({
      connected: true,
      bot: {
        id: data.result.id,
        username: data.result.username,
        first_name: data.result.first_name,
      },
      groups: count ?? 0,
    });
  } catch {
    return NextResponse.json({ connected: false, reason: "Failed to reach Telegram API" });
  }
}
