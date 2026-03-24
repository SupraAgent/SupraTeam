import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdmin()!;

  // RBAC: only admin_lead can view audit log
  const { data: callerProfile } = await admin.from("profiles").select("crm_role").eq("id", user.id).single();
  if (callerProfile?.crm_role !== "admin_lead") {
    return NextResponse.json({ error: "Only admin leads can view the audit log" }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const offset = (page - 1) * limit;

  const { data: logs, error } = await admin
    .from("crm_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[api/admin/audit] error:", error);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }

  // Enrich with actor/target display names
  const userIds = new Set<string>();
  for (const log of logs ?? []) {
    if (log.actor_id) userIds.add(log.actor_id);
    if (log.target_id) userIds.add(log.target_id);
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", Array.from(userIds));

  const nameMap: Record<string, string> = {};
  for (const p of profiles ?? []) {
    nameMap[p.id] = p.display_name ?? "Unknown";
  }

  const enriched = (logs ?? []).map((log) => ({
    ...log,
    actor_name: nameMap[log.actor_id] ?? "Unknown",
    target_name: log.target_id ? (nameMap[log.target_id] ?? "Unknown") : null,
  }));

  return NextResponse.json({ data: enriched, source: "supabase" });
}
