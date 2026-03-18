import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: logs, error } = await supabase
    .from("crm_slug_access_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[api/access/log] error:", error);
    return NextResponse.json({ error: "Failed to fetch access log" }, { status: 500 });
  }

  // Enrich with profile data for performed_by and target_user_id
  const performedByIds = [...new Set((logs ?? []).map((l) => l.performed_by).filter(Boolean))];
  const targetIds = [...new Set((logs ?? []).map((l) => l.target_user_id).filter(Boolean))];
  const allIds = [...new Set([...performedByIds, ...targetIds])];

  let profileMap: Record<string, { display_name: string; avatar_url: string }> = {};

  if (allIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", allIds);

    if (profiles) {
      for (const p of profiles) {
        profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      }
    }
  }

  const enriched = (logs ?? []).map((l) => ({
    ...l,
    performed_by_profile: l.performed_by ? profileMap[l.performed_by] ?? null : null,
    target_user_profile: l.target_user_id ? profileMap[l.target_user_id] ?? null : null,
  }));

  return NextResponse.json({ logs: enriched });
}
