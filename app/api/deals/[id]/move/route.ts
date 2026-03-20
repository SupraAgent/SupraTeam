import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { formatStageChangeMessage } from "@/lib/telegram-templates";
import { sendTelegramWithTracking } from "@/lib/telegram-send";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { stage_id } = await request.json();
  if (!stage_id) {
    return NextResponse.json({ error: "stage_id is required" }, { status: 400 });
  }

  const { data: current } = await supabase
    .from("crm_deals")
    .select("stage_id")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (current.stage_id === stage_id) {
    return NextResponse.json({ ok: true, moved: false });
  }

  // Record history
  await supabase.from("crm_deal_stage_history").insert({
    deal_id: id,
    from_stage_id: current.stage_id,
    to_stage_id: stage_id,
    changed_by: user.id,
    notified_at: new Date().toISOString(), // Mark as notified since we send inline
  });

  // Update deal
  const { data: deal, error } = await supabase
    .from("crm_deals")
    .update({
      stage_id,
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[api/deals/[id]/move] error:", error);
    return NextResponse.json({ error: "Failed to move deal" }, { status: 500 });
  }

  // Fetch stage names for notification
  const [fromRes, toRes] = await Promise.all([
    current.stage_id
      ? supabase.from("pipeline_stages").select("name").eq("id", current.stage_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("pipeline_stages").select("name").eq("id", stage_id).single(),
  ]);
  const fromName = fromRes.data?.name ?? "None";
  const toName = toRes.data?.name ?? "None";
  const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";

  // Send TG notification with tracking (non-blocking)
  if (deal.telegram_chat_id) {
    const message = formatStageChangeMessage(deal.deal_name, fromName, toName, deal.board_type, userName);
    sendTelegramWithTracking({
      chatId: deal.telegram_chat_id,
      text: message,
      notificationType: "stage_change",
      dealId: id,
      replyMarkup: {
        inline_keyboard: [[
          { text: "Open in CRM", web_app: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/tma/deals/${id}` } },
        ]],
      },
    }).catch((err) => console.error("[move] TG send error:", err));
  }

  // Audit log
  logAudit({
    action: "deal_move",
    entityType: "deal",
    entityId: id,
    actorId: user.id,
    actorName: userName,
    details: { from_stage: fromName, to_stage: toName, deal_name: deal.deal_name },
  }).catch(() => {});

  // Fire webhooks (non-blocking)
  dispatchWebhook("deal.stage_changed", { deal_id: id, deal_name: deal.deal_name, from_stage: fromName, to_stage: toName, board_type: deal.board_type }).catch(() => {});

  // Evaluate automation rules (non-blocking)
  evaluateAutomationRules({
    type: "stage_change",
    dealId: id,
    payload: {
      from_stage_id: current.stage_id,
      to_stage_id: stage_id,
      from_stage_name: fromName,
      to_stage_name: toName,
      changed_by: userName,
      value: deal.value,
    },
  }).catch((err) => console.error("[move] Automation error:", err));

  return NextResponse.json({ deal, ok: true, moved: true });
}
