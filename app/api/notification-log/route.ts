import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  let query = supabase
    .from("crm_notification_log")
    .select("*, deal:crm_deals(deal_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (type) query = query.eq("notification_type", type);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stats summary
  const { data: stats } = await supabase.rpc("get_notification_stats").single();
  // Fallback if RPC not available
  let summary = stats;
  if (!summary) {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [sent, failed, dead] = await Promise.all([
      supabase.from("crm_notification_log").select("id", { count: "exact", head: true }).eq("status", "sent").gte("created_at", dayAgo),
      supabase.from("crm_notification_log").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", dayAgo),
      supabase.from("crm_notification_log").select("id", { count: "exact", head: true }).eq("status", "dead_letter").gte("created_at", dayAgo),
    ]);
    summary = {
      sent_24h: sent.count ?? 0,
      failed_24h: failed.count ?? 0,
      dead_letter_24h: dead.count ?? 0,
    };
  }

  return NextResponse.json({ logs: data ?? [], stats: summary });
}
