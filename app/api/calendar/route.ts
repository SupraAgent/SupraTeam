import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to params required" }, { status: 400 });
  }

  // Validate ISO date format and reasonable range
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format — use ISO 8601" }, { status: 400 });
  }
  if (toDate < fromDate) {
    return NextResponse.json({ error: "'to' must be after 'from'" }, { status: 400 });
  }
  const rangeDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  if (rangeDays > 366) {
    return NextResponse.json({ error: "Date range cannot exceed 1 year" }, { status: 400 });
  }

  // Fetch deals with expected close dates in range
  const [dealsRes, historyRes, remindersRes, broadcastsRes] = await Promise.all([
    supabase
      .from("crm_deals")
      .select("id, deal_name, board_type, value, probability, expected_close_date, outcome, stage_changed_at, stage:pipeline_stages(name, color)")
      .or(`expected_close_date.gte.${from},stage_changed_at.gte.${from}`)
      .or(`expected_close_date.lte.${to},stage_changed_at.lte.${to}`),
    supabase
      .from("crm_deal_stage_history")
      .select("id, deal_id, from_stage_id, to_stage_id, changed_at, deal:crm_deals(deal_name, board_type), from_stage:pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name)")
      .gte("changed_at", from)
      .lte("changed_at", to)
      .order("changed_at", { ascending: false }),
    supabase
      .from("crm_reminders")
      .select("id, deal_id, type, message, due_at, snoozed_until, dismissed, deal:crm_deals(deal_name, board_type)")
      .gte("due_at", from)
      .lte("due_at", to)
      .eq("dismissed", false),
    supabase
      .from("crm_broadcasts")
      .select("id, message, scheduled_at, status, group_count")
      .gte("scheduled_at", from)
      .lte("scheduled_at", to)
      .eq("status", "scheduled"),
  ]);

  type CalendarEvent = {
    id: string;
    type: "close_date" | "stage_change" | "reminder" | "broadcast";
    date: string;
    title: string;
    subtitle?: string;
    color: string;
    meta?: Record<string, unknown>;
  };

  const events: CalendarEvent[] = [];

  // Expected close dates
  for (const d of dealsRes.data ?? []) {
    if (d.expected_close_date && d.outcome !== "won" && d.outcome !== "lost") {
      const stage = d.stage as unknown as { name: string; color: string | null } | null;
      events.push({
        id: `close-${d.id}`,
        type: "close_date",
        date: d.expected_close_date,
        title: d.deal_name,
        subtitle: `Expected close${d.value ? ` — $${Number(d.value).toLocaleString()}` : ""}`,
        color: stage?.color ?? "#3b82f6",
        meta: { deal_id: d.id, deal_name: d.deal_name, board_type: d.board_type, value: d.value, probability: d.probability },
      });
    }
  }

  // Stage changes
  for (const h of historyRes.data ?? []) {
    const deal = h.deal as unknown as { deal_name: string; board_type: string } | null;
    const fromStage = h.from_stage as unknown as { name: string } | null;
    const toStage = h.to_stage as unknown as { name: string } | null;
    events.push({
      id: `stage-${h.id}`,
      type: "stage_change",
      date: h.changed_at,
      title: deal?.deal_name ?? "Unknown deal",
      subtitle: `${fromStage?.name ?? "?"} → ${toStage?.name ?? "?"}`,
      color: "#8b5cf6",
      meta: { deal_id: h.deal_id, deal_name: deal?.deal_name },
    });
  }

  // Reminders
  for (const r of remindersRes.data ?? []) {
    const deal = r.deal as unknown as { deal_name: string; board_type: string } | null;
    events.push({
      id: `reminder-${r.id}`,
      type: "reminder",
      date: r.snoozed_until ?? r.due_at,
      title: r.message ?? `${r.type} reminder`,
      subtitle: deal?.deal_name ?? undefined,
      color: "#f59e0b",
      meta: { deal_id: r.deal_id, deal_name: deal?.deal_name, type: r.type },
    });
  }

  // Scheduled broadcasts
  for (const b of broadcastsRes.data ?? []) {
    events.push({
      id: `broadcast-${b.id}`,
      type: "broadcast",
      date: b.scheduled_at,
      title: `Broadcast: ${(b.message ?? "").substring(0, 50)}...`,
      subtitle: `${b.group_count ?? 0} groups`,
      color: "#10b981",
    });
  }

  return NextResponse.json({ events });
}
