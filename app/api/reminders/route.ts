import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

// GET active reminders (supports ?all=1 for tasks page to include snoozed & future)
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";
  const dealId = url.searchParams.get("deal_id");

  let query = supabase
    .from("crm_deal_reminders")
    .select("*, deal:crm_deals(id, deal_name, board_type, stage:pipeline_stages(name, color)), assigned_profile:profiles!crm_deal_reminders_assigned_to_fkey(display_name, avatar_url)")
    .eq("is_dismissed", false)
    .order("due_at", { ascending: true })
    .limit(100);

  if (!all) {
    // Default: only due reminders (not snoozed)
    const now = new Date().toISOString();
    query = query.lte("due_at", now).or(`snoozed_until.is.null,snoozed_until.lte.${now}`);
  }

  if (dealId) {
    query = query.eq("deal_id", dealId);
  }

  const { data: reminders } = await query;
  return NextResponse.json({ reminders: reminders ?? [], current_user_id: user.id });
}

// POST: create manual task OR generate auto-reminders
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json().catch(() => ({}));

  // Manual task creation
  if (body.message) {
    const { data: task, error } = await supabase
      .from("crm_deal_reminders")
      .insert({
        deal_id: body.deal_id || null,
        reminder_type: "manual",
        message: body.message,
        due_at: body.due_at || new Date().toISOString(),
        assigned_to: body.assigned_to || user.id,
        created_by: user.id,
        priority: body.priority || "normal",
      })
      .select("*, deal:crm_deals(id, deal_name, board_type, stage:pipeline_stages(name, color))")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ task });
  }

  // Auto-generate reminders from stage rules
  const { data: rules } = await supabase
    .from("crm_stage_reminders")
    .select("stage_id, remind_after_hours, message")
    .eq("is_active", true);

  if (!rules || rules.length === 0) return NextResponse.json({ generated: 0 });

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

// PATCH: dismiss, snooze, set_priority, or reassign a reminder
export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id, action, snooze_hours, priority, assigned_to } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (action === "snooze" && snooze_hours) {
    const snoozedUntil = new Date(Date.now() + snooze_hours * 3600000).toISOString();
    await supabase
      .from("crm_deal_reminders")
      .update({ snoozed_until: snoozedUntil, due_at: snoozedUntil })
      .eq("id", id);
  } else if (action === "set_priority" && priority) {
    await supabase
      .from("crm_deal_reminders")
      .update({ priority })
      .eq("id", id);
  } else if (action === "reassign" && assigned_to) {
    await supabase
      .from("crm_deal_reminders")
      .update({ assigned_to })
      .eq("id", id);
  } else {
    // Default: dismiss
    await supabase.from("crm_deal_reminders").update({ is_dismissed: true }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
