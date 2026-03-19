import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { formatStageChangeMessage } from "@/lib/telegram-templates";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: number, text: string) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// Called by Vercel cron or external scheduler
export async function GET(request: Request) {
  const { verifyCron } = await import("@/lib/cron-auth");
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;

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

        // Load custom template if available
        const { data: tpl } = await supabase
          .from("crm_bot_templates")
          .select("body_template")
          .eq("template_key", "stage_change")
          .eq("is_active", true)
          .single();

        const message = formatStageChangeMessage(
          deal.deal_name,
          fromName,
          toName,
          deal.board_type ?? "Unknown",
          changedByName,
          tpl?.body_template ?? undefined
        );
        await sendTelegramMessage(deal.telegram_chat_id, message);
        processed++;
      }
      // Mark as notified only on success
      await supabase
        .from("crm_deal_stage_history")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", change.id);
    } catch (err) {
      console.error(`[poll-notifications] Error processing ${change.id}:`, err);
      // Don't mark as notified — will retry next poll
    }
  }

  // Auto-generate reminders based on stage rules
  let remindersGenerated = 0;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.supravibe.xyz";
    const reminderRes = await fetch(`${baseUrl}/api/reminders`, { method: "POST" });
    if (reminderRes.ok) {
      const data = await reminderRes.json();
      remindersGenerated = data.generated ?? 0;
    }
  } catch (err) {
    console.error("[poll-notifications] reminder generation error:", err);
  }

  return NextResponse.json({ processed, remindersGenerated });
}
