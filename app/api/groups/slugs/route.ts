import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: slugs, error } = await supabase
    .from("tg_group_slugs")
    .select("*")
    .order("slug");

  if (error) {
    console.error("[api/groups/slugs] error:", error);
    return NextResponse.json({ error: "Failed to fetch slugs" }, { status: 500 });
  }

  return NextResponse.json({ slugs: slugs ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { group_id, slug } = await request.json();
  if (!group_id || !slug) {
    return NextResponse.json({ error: "group_id and slug are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tg_group_slugs")
    .insert({ group_id, slug: slug.toLowerCase().trim() })
    .select()
    .single();

  if (error) {
    console.error("[api/groups/slugs] insert error:", error);
    return NextResponse.json({ error: "Failed to add slug" }, { status: 500 });
  }

  return NextResponse.json({ slug: data, ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { group_id, slug } = await request.json();
  if (!group_id || !slug) {
    return NextResponse.json({ error: "group_id and slug are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tg_group_slugs")
    .delete()
    .eq("group_id", group_id)
    .eq("slug", slug);

  if (error) {
    console.error("[api/groups/slugs] delete error:", error);
    return NextResponse.json({ error: "Failed to remove slug" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
