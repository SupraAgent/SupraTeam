import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { createSupabaseAdmin } from "@/lib/supabase";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramNotification(supabase: ReturnType<typeof createSupabaseAdmin>, dealId: string, fromStageId: string | null, toStageId: string) {
  if (!BOT_TOKEN || !supabase) return;

  try {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("deal_name, board_type, telegram_chat_id")
      .eq("id", dealId)
      .single();

    if (!deal?.telegram_chat_id) return;

    const [fromRes, toRes] = await Promise.all([
      fromStageId
        ? supabase.from("pipeline_stages").select("name").eq("id", fromStageId).single()
        : Promise.resolve({ data: null }),
      supabase.from("pipeline_stages").select("name").eq("id", toStageId).single(),
    ]);

    const fromName = fromRes.data?.name ?? "None";
    const toName = toRes.data?.name ?? "None";

    const message =
      `Deal Update: ${deal.deal_name}\n\n` +
      `Stage: ${fromName} -> ${toName}\n` +
      `Board: ${deal.board_type}`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: deal.telegram_chat_id, text: message }),
    });
  } catch (err) {
    console.error("[move] TG notification error:", err);
  }
}

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

  // Send TG notification inline (non-blocking)
  sendTelegramNotification(supabase, id, current.stage_id, stage_id);

  return NextResponse.json({ deal, ok: true, moved: true });
}
