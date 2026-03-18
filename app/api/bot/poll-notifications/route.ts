import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: number, text: string) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Called by Vercel cron or external scheduler
export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase || !BOT_TOKEN) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // Find unnotified stage changes
  const { data: changes, error } = await supabase
    .from("crm_deal_stage_history")
    .select("id, deal_id, from_stage_id, to_stage_id, changed_by, changed_at")
    .is("notified_at", null)
    .order("changed_at", { ascending: true })
    .limit(10);

  if (error || !changes || changes.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;

  for (const change of changes) {
    try {
      // Fetch deal
      const { data: deal } = await supabase
        .from("crm_deals")
        .select("deal_name, board_type, telegram_chat_id")
        .eq("id", change.deal_id)
        .single();

      if (deal?.telegram_chat_id) {
        // Fetch stage names
        const [fromRes, toRes] = await Promise.all([
          change.from_stage_id
            ? supabase.from("pipeline_stages").select("name").eq("id", change.from_stage_id).single()
            : Promise.resolve({ data: null }),
          change.to_stage_id
            ? supabase.from("pipeline_stages").select("name").eq("id", change.to_stage_id).single()
            : Promise.resolve({ data: null }),
        ]);

        const fromName = fromRes.data?.name ?? "None";
        const toName = toRes.data?.name ?? "None";

        // Fetch who changed
        let changedByName = "Unknown";
        if (change.changed_by) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", change.changed_by)
            .single();
          if (profile?.display_name) changedByName = profile.display_name;
        }

        const message =
          `Deal Update: ${deal.deal_name}\n\n` +
          `Stage: ${fromName} -> ${toName}\n` +
          `Board: ${deal.board_type}\n` +
          `Changed by: ${changedByName}`;

        await sendTelegramMessage(deal.telegram_chat_id, message);
        processed++;
      }
    } catch (err) {
      console.error(`[poll-notifications] Error processing ${change.id}:`, err);
    }

    // Mark as notified
    await supabase
      .from("crm_deal_stage_history")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", change.id);
  }

  return NextResponse.json({ processed });
}
