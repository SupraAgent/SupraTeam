import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;
  const { slug } = await params;

  const { data: grants, error } = await supabase
    .from("crm_user_slug_access")
    .select("*")
    .eq("slug", slug)
    .order("granted_at", { ascending: false });

  if (error) {
    console.error("[api/access/slug] error:", error);
    return NextResponse.json({ error: "Failed to fetch access for slug" }, { status: 500 });
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

  return NextResponse.json({ grants: enriched, slug });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;
  const { slug } = await params;

  const body = await request.json();
  const { user_id } = body;

  if (!user_id) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_user_slug_access")
    .delete()
    .eq("user_id", user_id)
    .eq("slug", slug);

  if (error) {
    console.error("[api/access/slug] delete error:", error);
    return NextResponse.json({ error: "Failed to revoke access" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, slug, user_id });
}
