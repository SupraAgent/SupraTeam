/**
 * Shared deal stage-move logic used by both the API route and bot callback actions.
 * Ensures automation rules, audit logging, and webhooks fire consistently.
 */
import { createSupabaseAdmin } from "@/lib/supabase";
import { formatStageChangeMessage, formatPinnedDealStatus } from "@/lib/telegram-templates";
import { sendTelegramWithTracking, sendAndPinMessage } from "@/lib/telegram-send";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

interface DealMoveResult {
  success: boolean;
  error?: string;
  fromStage?: string;
  toStage?: string;
}

export async function executeDealMove(params: {
  dealId: string;
  toStageId: string;
  changedByUserId: string;
  changedByName: string;
}): Promise<DealMoveResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const { dealId, toStageId, changedByUserId, changedByName } = params;

  const { data: current } = await supabase
    .from("crm_deals")
    .select("stage_id")
    .eq("id", dealId)
    .single();

  if (!current) return { success: false, error: "Deal not found" };
  if (current.stage_id === toStageId) return { success: true, fromStage: "same", toStage: "same" };

  // Record history
  await supabase.from("crm_deal_stage_history").insert({
    deal_id: dealId,
    from_stage_id: current.stage_id,
    to_stage_id: toStageId,
    changed_by: changedByUserId,
    notified_at: new Date().toISOString(),
  });

  // Update deal
  const { data: deal, error } = await supabase
    .from("crm_deals")
    .update({
      stage_id: toStageId,
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealId)
    .select()
    .single();

  if (error || !deal) return { success: false, error: error?.message ?? "Update failed" };

  // Fetch stage names
  const [fromRes, toRes] = await Promise.all([
    current.stage_id
      ? supabase.from("pipeline_stages").select("name").eq("id", current.stage_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("pipeline_stages").select("name").eq("id", toStageId).single(),
  ]);
  const fromName = fromRes.data?.name ?? "None";
  const toName = toRes.data?.name ?? "None";

  // TG notification (non-blocking)
  if (deal.telegram_chat_id) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const message = formatStageChangeMessage(deal.deal_name, fromName, toName, deal.board_type, changedByName);
    sendTelegramWithTracking({
      chatId: deal.telegram_chat_id,
      text: message,
      notificationType: "stage_change",
      dealId,
      replyMarkup: siteUrl ? {
        inline_keyboard: [[
          { text: "Open in CRM", web_app: { url: `${siteUrl}/tma/deals/${dealId}` } },
        ]],
      } : undefined,
    }).catch((err) => console.error("[deal-move] TG send error:", err));

    // Pin deal status summary
    const pinnedText = formatPinnedDealStatus(deal.deal_name, toName, deal.board_type, changedByName);
    sendAndPinMessage({
      chatId: deal.telegram_chat_id,
      text: pinnedText,
      notificationType: "deal_status_pin",
      dealId,
    }).catch((err) => console.error("[deal-move] Pin error:", err));
  }

  // Audit log (non-blocking)
  logAudit({
    action: "deal_move",
    entityType: "deal",
    entityId: dealId,
    actorId: changedByUserId,
    actorName: changedByName,
    details: { from_stage: fromName, to_stage: toName, deal_name: deal.deal_name },
  }).catch(() => {});

  // Webhooks (non-blocking)
  dispatchWebhook("deal.stage_changed", {
    deal_id: dealId,
    deal_name: deal.deal_name,
    from_stage: fromName,
    to_stage: toName,
    board_type: deal.board_type,
  }).catch(() => {});

  // Automation rules (non-blocking)
  evaluateAutomationRules({
    type: "stage_change",
    dealId,
    payload: {
      from_stage_id: current.stage_id,
      to_stage_id: toStageId,
      from_stage_name: fromName,
      to_stage_name: toName,
      changed_by: changedByName,
      value: deal.value,
    },
  }).catch((err) => console.error("[deal-move] Automation error:", err));

  return { success: true, fromStage: fromName, toStage: toName };
}
