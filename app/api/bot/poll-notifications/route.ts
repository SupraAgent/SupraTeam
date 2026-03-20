import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { formatStageChangeMessage } from "@/lib/telegram-templates";
import { sendTelegramWithTracking, processRetries, processScheduledMessages } from "@/lib/telegram-send";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Called by Railway cron service, external scheduler, or directly via GET
export async function GET(request: Request) {
  const { verifyCron } = await import("@/lib/cron-auth");
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;

  const supabase = createSupabaseAdmin();
  if (!supabase || !BOT_TOKEN) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // 1. Process unnotified stage changes
  const { data: changes, error } = await supabase
    .from("crm_deal_stage_history")
    .select("id, deal_id, from_stage_id, to_stage_id, changed_by, changed_at")
    .is("notified_at", null)
    .order("changed_at", { ascending: true })
    .limit(10);

  let processed = 0;

  if (!error && changes && changes.length > 0) {
    for (const change of changes) {
      try {
        const { data: deal } = await supabase
          .from("crm_deals")
          .select("deal_name, board_type, telegram_chat_id")
          .eq("id", change.deal_id)
          .single();

        if (deal?.telegram_chat_id) {
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

          let changedByName = "Unknown";
          if (change.changed_by) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("id", change.changed_by)
              .single();
            if (profile?.display_name) changedByName = profile.display_name;
          }

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

          await sendTelegramWithTracking({
            chatId: deal.telegram_chat_id,
            text: message,
            notificationType: "stage_change",
            dealId: change.deal_id,
          });
          processed++;
        }

        await supabase
          .from("crm_deal_stage_history")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", change.id);
      } catch (err) {
        console.error(`[poll-notifications] Error processing ${change.id}:`, err);
      }
    }
  }

  // 2. Process failed notification retries
  let retried = 0;
  try {
    retried = await processRetries();
  } catch (err) {
    console.error("[poll-notifications] Retry processing error:", err);
  }

  // 3. Process scheduled messages that are due
  let scheduled = 0;
  try {
    scheduled = await processScheduledMessages();
  } catch (err) {
    console.error("[poll-notifications] Scheduled message error:", err);
  }

  // 4. Auto-generate reminders
  let remindersGenerated = 0;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!baseUrl) throw new Error("NEXT_PUBLIC_SITE_URL not set");
    const reminderRes = await fetch(`${baseUrl}/api/reminders`, { method: "POST" });
    if (reminderRes.ok) {
      const data = await reminderRes.json();
      remindersGenerated = data.generated ?? 0;
    }
  } catch (err) {
    console.error("[poll-notifications] reminder generation error:", err);
  }

  return NextResponse.json({ processed, retried, scheduled, remindersGenerated });
}
