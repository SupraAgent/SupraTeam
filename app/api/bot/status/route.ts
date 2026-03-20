import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getAllActiveBots, getDefaultBot } from "@/lib/bot-registry";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const botId = searchParams.get("botId");

  // Single bot status
  if (botId) {
    const { getBotById } = await import("@/lib/bot-registry");
    const bot = await getBotById(botId);
    if (!bot) return NextResponse.json({ ok: false, error: "Bot not found" });

    try {
      const res = await fetch(`https://api.telegram.org/bot${bot.token}/getMe`);
      const data = await res.json();
      if (!data.ok) return NextResponse.json({ ok: false, connected: false, error: "Invalid token" });

      const supabase = createSupabaseAdmin();
      let groups = 0;
      if (supabase) {
        const { count } = await supabase.from("tg_groups").select("id", { count: "exact", head: true }).eq("bot_id", botId);
        groups = count ?? 0;
      }

      return NextResponse.json({ ok: true, connected: true, result: data.result, groups, bot_id: botId });
    } catch {
      return NextResponse.json({ ok: false, connected: false, error: "Failed to reach Telegram" });
    }
  }

  // All bots status
  const allParam = searchParams.get("all");
  if (allParam === "true") {
    const bots = await getAllActiveBots();
    const supabase = createSupabaseAdmin();
    const results = [];

    for (const bot of bots) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${bot.token}/getMe`);
        const data = await res.json();
        let groups = 0;
        if (supabase) {
          const { count } = await supabase.from("tg_groups").select("id", { count: "exact", head: true }).eq("bot_id", bot.id);
          groups = count ?? 0;
        }
        results.push({ bot_id: bot.id, label: bot.label, ok: data.ok, result: data.ok ? data.result : null, groups });
      } catch {
        results.push({ bot_id: bot.id, label: bot.label, ok: false, result: null, groups: 0 });
      }
    }
    return NextResponse.json({ ok: true, bots: results });
  }

  // Default bot (backwards compatible)
  const defaultBot = await getDefaultBot();
  if (!defaultBot) {
    return NextResponse.json({ ok: false, connected: false, error: "No bot configured" });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${defaultBot.token}/getMe`);
    const data = await res.json();
    if (!data.ok) return NextResponse.json({ ok: false, connected: false, error: "Invalid token" });

    const supabase = createSupabaseAdmin();
    let groups = 0;
    if (supabase) {
      const { count } = await supabase.from("tg_groups").select("id", { count: "exact", head: true }).eq("bot_is_admin", true);
      groups = count ?? 0;
    }

    return NextResponse.json({ ok: true, connected: true, result: data.result, groups });
  } catch {
    return NextResponse.json({ ok: false, connected: false, error: "Failed to reach Telegram" });
  }
}
