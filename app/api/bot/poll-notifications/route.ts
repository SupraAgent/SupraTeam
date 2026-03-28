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

  // 5. Trigger scheduled Loop Builder workflows (match cron expressions)
  let scheduledWorkflows = 0;
  try {
    const { executeLoopWorkflow, isLoopBuilderWorkflow } = await import("@/lib/loop-workflow-engine");
    const { data: schedWfs } = await supabase
      .from("crm_workflows")
      .select("*")
      .eq("is_active", true)
      .eq("trigger_type", "scheduled");

    const now = new Date();
    for (const wf of schedWfs ?? []) {
      if (!isLoopBuilderWorkflow(wf.nodes ?? [])) continue;
      // Find the trigger node and check cron config
      const nodes = (wf.nodes ?? []) as Array<Record<string, unknown>>;
      const triggerNode = nodes.find((n) => n.type === "crmTriggerNode");
      if (!triggerNode) continue;
      const triggerData = (triggerNode.data ?? {}) as Record<string, unknown>;
      const config = (triggerData.config ?? {}) as Record<string, string>;
      const cronExpr = config.cron;
      if (!cronExpr) continue;
      // Simple cron check: match minute and hour fields against current time
      // Full cron parsing would require a library; this handles common patterns
      if (!matchesCronWindow(cronExpr, now)) continue;
      try {
        await executeLoopWorkflow(wf.id, {
          type: "scheduled",
          payload: { triggered_at: now.toISOString(), cron: cronExpr },
        });
        scheduledWorkflows++;
      } catch (err) {
        console.error(`[poll-notifications] Scheduled workflow ${wf.id} error:`, err);
      }
    }
  } catch (err) {
    console.error("[poll-notifications] Scheduled workflow error:", err);
  }

  return NextResponse.json({ processed, retried, scheduled, remindersGenerated, scheduledWorkflows });
}

/**
 * Simple cron expression matcher for minute/hour/day-of-week fields.
 * Supports: *, specific values, and comma-separated lists.
 * Cron runs ~every 5 minutes, so we check if the current time is within
 * a 5-minute window of the cron spec.
 */
function matchesCronWindow(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [minField, hourField, , , dowField] = parts;
  const min = now.getMinutes();
  const hour = now.getHours();
  const dow = now.getDay();

  if (!matchesCronField(hourField, hour)) return false;
  if (!matchesCronField(dowField, dow)) return false;
  // For minutes, allow a 5-minute window (since cron polls every ~5 min)
  if (minField === "*") return true;
  const allowedMins = parseCronField(minField);
  return allowedMins.some((m) => Math.abs(m - min) <= 5 || Math.abs(m + 60 - min) <= 5);
}

function matchesCronField(field: string, value: number): boolean {
  if (field === "*") return true;
  return parseCronField(field).includes(value);
}

function parseCronField(field: string): number[] {
  if (field === "*") return [];
  // Handle ranges like 1-5
  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    const result: number[] = [];
    for (let i = start; i <= end; i++) result.push(i);
    return result;
  }
  // Handle comma-separated values
  return field.split(",").map(Number).filter((n) => !isNaN(n));
}
