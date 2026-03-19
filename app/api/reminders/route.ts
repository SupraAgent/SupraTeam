import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

// GET active reminders
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: reminders } = await supabase
    .from("crm_deal_reminders")
    .select("*, deal:crm_deals(id, deal_name, board_type, stage:pipeline_stages(name, color))")
    .eq("is_dismissed", false)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(20);

  return NextResponse.json({ reminders: reminders ?? [] });
}

// POST: generate reminders based on stage rules
export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  // Get stage reminder rules
  const { data: rules } = await supabase
    .from("crm_stage_reminders")
    .select("stage_id, remind_after_hours, message")
    .eq("is_active", true);

  if (!rules || rules.length === 0) return NextResponse.json({ generated: 0 });

  // Get open deals
  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, deal_name, stage_id, stage_changed_at, updated_at")
    .eq("outcome", "open");

  if (!deals) return NextResponse.json({ generated: 0 });

  let generated = 0;
  const now = Date.now();

  for (const deal of deals) {
    const rule = rules.find((r) => r.stage_id === deal.stage_id);
    if (!rule) continue;

    const lastActivity = new Date(deal.updated_at ?? deal.stage_changed_at).getTime();
    const hoursSince = (now - lastActivity) / 3600000;

    if (hoursSince >= rule.remind_after_hours) {
      // Check if reminder already exists for this deal
      const { data: existing } = await supabase
        .from("crm_deal_reminders")
        .select("id")
        .eq("deal_id", deal.id)
        .eq("reminder_type", "follow_up")
        .eq("is_dismissed", false)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("crm_deal_reminders").insert({
          deal_id: deal.id,
          reminder_type: "follow_up",
          message: rule.message.replace("{deal}", deal.deal_name).replace("{hours}", String(Math.round(hoursSince))),
          due_at: new Date().toISOString(),
        });
        generated++;
      }
    }
  }

  // Generate stage suggestions: deals with lots of TG activity
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: activeDeals } = await supabase
    .from("crm_notifications")
    .select("deal_id")
    .eq("type", "tg_message")
    .gte("created_at", sevenDaysAgo);

  if (activeDeals) {
    const msgCounts: Record<string, number> = {};
    for (const n of activeDeals) {
      if (n.deal_id) msgCounts[n.deal_id] = (msgCounts[n.deal_id] ?? 0) + 1;
    }

    for (const [dealId, count] of Object.entries(msgCounts)) {
      if (count >= 10) {
        const deal = deals.find((d) => d.id === dealId);
        if (!deal) continue;

        const { data: existing } = await supabase
          .from("crm_deal_reminders")
          .select("id")
          .eq("deal_id", dealId)
          .eq("reminder_type", "stage_suggestion")
          .eq("is_dismissed", false)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from("crm_deal_reminders").insert({
            deal_id: dealId,
            reminder_type: "stage_suggestion",
            message: `${deal.deal_name} has ${count} messages this week. Consider moving to next stage.`,
            due_at: new Date().toISOString(),
          });
          generated++;
        }
      }
    }
  }

  return NextResponse.json({ generated });
}

// PATCH: dismiss a reminder
export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await supabase.from("crm_deal_reminders").update({ is_dismissed: true }).eq("id", id);
  return NextResponse.json({ ok: true });
}
