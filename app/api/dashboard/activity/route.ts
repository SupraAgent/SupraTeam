import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface ActivityEvent {
  id: string;
  type: "stage_change" | "deal_created" | "tg_message" | "broadcast" | "member_event" | "workflow_run";
  title: string;
  description: string;
  timestamp: string;
  link?: string;
  meta?: Record<string, unknown>;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 30), 100);

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [stageHistoryRes, dealsRes, notifLogRes, workflowRunsRes, memberEventsRes] = await Promise.all([
    supabase
      .from("crm_deal_stage_history")
      .select("id, deal_id, changed_at, changed_by, from_stage:pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name), deal:crm_deals(deal_name, board_type)")
      .gte("changed_at", since)
      .order("changed_at", { ascending: false })
      .limit(20),
    supabase
      .from("crm_deals")
      .select("id, deal_name, board_type, value, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("crm_notification_log")
      .select("id, notification_type, message_preview, status, deal_id, created_at, sent_at, deal:crm_deals(deal_name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("crm_workflow_runs")
      .select("id, workflow_id, status, started_at, completed_at, duration_ms, error, workflow:crm_workflows(name)")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(10),
    supabase
      .from("tg_group_member_events")
      .select("id, event_type, telegram_user_id, created_at, group:tg_groups(group_name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const events: ActivityEvent[] = [];

  // Stage changes
  for (const h of stageHistoryRes.data ?? []) {
    const deal = h.deal as unknown as { deal_name: string; board_type: string } | null;
    const from = (h.from_stage as unknown as { name: string } | null)?.name ?? "—";
    const to = (h.to_stage as unknown as { name: string } | null)?.name ?? "—";
    events.push({
      id: `stage_${h.id}`,
      type: "stage_change",
      title: `${deal?.deal_name ?? "Deal"} moved`,
      description: `${from} → ${to}`,
      timestamp: h.changed_at,
      link: `/pipeline?highlight=${h.deal_id}`,
      meta: { board_type: deal?.board_type },
    });
  }

  // New deals
  for (const d of dealsRes.data ?? []) {
    events.push({
      id: `deal_${d.id}`,
      type: "deal_created",
      title: `New deal: ${d.deal_name}`,
      description: `${d.board_type}${d.value ? ` · $${Number(d.value).toLocaleString()}` : ""}`,
      timestamp: d.created_at,
      link: `/pipeline?highlight=${d.id}`,
    });
  }

  // Notification log (broadcasts, stage notifications)
  for (const n of notifLogRes.data ?? []) {
    const deal = n.deal as unknown as { deal_name: string } | null;
    const typeLabel = n.notification_type === "broadcast" ? "Broadcast sent" :
      n.notification_type === "stage_change" ? "Stage notification" :
      n.notification_type === "daily_digest" ? "Daily digest" : "Notification";
    events.push({
      id: `notif_${n.id}`,
      type: "broadcast",
      title: typeLabel,
      description: n.message_preview?.slice(0, 80) ?? deal?.deal_name ?? "—",
      timestamp: n.sent_at ?? n.created_at,
      meta: { status: n.status },
    });
  }

  // Workflow runs
  for (const w of workflowRunsRes.data ?? []) {
    const wf = w.workflow as unknown as { name: string } | null;
    const statusLabel = w.status === "completed" ? "completed" :
      w.status === "failed" ? `failed: ${w.error?.slice(0, 50) ?? "unknown"}` : w.status;
    events.push({
      id: `wf_${w.id}`,
      type: "workflow_run",
      title: `Workflow: ${wf?.name ?? "Unknown"}`,
      description: statusLabel,
      timestamp: w.started_at,
      meta: { status: w.status, duration_ms: w.duration_ms },
    });
  }

  // Member events
  for (const m of memberEventsRes.data ?? []) {
    const group = m.group as unknown as { group_name: string } | null;
    const label = m.event_type === "joined" ? "Member joined" :
      m.event_type === "left" ? "Member left" :
      m.event_type === "banned" ? "Member removed" : m.event_type;
    events.push({
      id: `member_${m.id}`,
      type: "member_event",
      title: label,
      description: group?.group_name ?? "Unknown group",
      timestamp: m.created_at,
      link: "/groups",
    });
  }

  // Sort by timestamp descending, limit
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ events: events.slice(0, limit) });
}
