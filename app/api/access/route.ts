import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: grants, error } = await supabase
    .from("crm_user_slug_access")
    .select("*")
    .order("granted_at", { ascending: false });

  if (error) {
    console.error("[api/access] error:", error);
    return NextResponse.json({ error: "Failed to fetch access grants" }, { status: 500 });
  }

  // Enrich with profile data
  const userIds = [...new Set((grants ?? []).map((g) => g.user_id).filter(Boolean))];
  const grantedByIds = [...new Set((grants ?? []).map((g) => g.granted_by).filter(Boolean))];
  const allIds = [...new Set([...userIds, ...grantedByIds])];

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

  const enriched = (grants ?? []).map((g) => ({
    ...g,
    user_profile: g.user_id ? profileMap[g.user_id] ?? null : null,
    granted_by_profile: g.granted_by ? profileMap[g.granted_by] ?? null : null,
  }));

  return NextResponse.json({ grants: enriched });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  // Check if user has admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("crm_role")
    .eq("id", user.id)
    .single();

  if (!profile?.crm_role || profile.crm_role !== "admin_lead") {
    return NextResponse.json({ error: "Only admin_lead can manage access" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { user_id, slug, expires_at } = body as { user_id?: string; slug?: string; expires_at?: string };

  if (!user_id || !slug) {
    return NextResponse.json({ error: "user_id and slug are required" }, { status: 400 });
  }

  // Validate expires_at if provided — must be a valid future ISO timestamp
  let expiresDate: Date | null = null;
  if (expires_at) {
    expiresDate = new Date(expires_at);
    if (isNaN(expiresDate.getTime()) || expiresDate <= new Date()) {
      return NextResponse.json({ error: "expires_at must be a future ISO timestamp" }, { status: 400 });
    }
  }

  const { data: grant, error } = await supabase
    .from("crm_user_slug_access")
    .insert({
      user_id,
      slug,
      granted_by: user.id,
      granted_at: new Date().toISOString(),
      ...(expiresDate ? { expires_at: expiresDate.toISOString() } : {}),
    })
    .select()
    .single();

  if (error) {
    console.error("[api/access] insert error:", error);
    if (error.code === "23505") {
      return NextResponse.json({ error: "User already has access to this slug" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to grant access" }, { status: 500 });
  }

  const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";
  await logAudit({
    action: "grant_access",
    entityType: "access",
    entityId: slug,
    actorId: user.id,
    actorName: userName,
    details: { target_user_id: user_id, slug, expires_at: expiresDate?.toISOString() ?? null },
  });

  return NextResponse.json({ grant, ok: true });
}
