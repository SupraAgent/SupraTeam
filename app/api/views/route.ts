import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const page = req.nextUrl.searchParams.get("page");
  let query = supabase
    .from("crm_saved_views")
    .select("*")
    .eq("user_id", user.id)
    .order("position");

  if (page) query = query.eq("page", page);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ views: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await req.json();
  const { name, page, filters, board_type } = body;

  if (!name || !page) {
    return NextResponse.json({ error: "name and page are required" }, { status: 400 });
  }

  // Get next position
  const { count } = await supabase
    .from("crm_saved_views")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("page", page);

  const { data, error } = await supabase
    .from("crm_saved_views")
    .insert({
      user_id: user.id,
      name,
      page,
      filters: filters ?? {},
      board_type: board_type ?? null,
      position: (count ?? 0) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ view: data });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await req.json();
  const { id, name, filters, board_type, is_default } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (filters !== undefined) updates.filters = filters;
  if (board_type !== undefined) updates.board_type = board_type;
  if (is_default !== undefined) {
    updates.is_default = is_default;
    // If setting as default, unset other defaults for this page
    if (is_default) {
      const { data: view } = await supabase
        .from("crm_saved_views")
        .select("page")
        .eq("id", id)
        .single();
      if (view) {
        await supabase
          .from("crm_saved_views")
          .update({ is_default: false })
          .eq("user_id", user.id)
          .eq("page", view.page)
          .neq("id", id);
      }
    }
  }

  const { data, error } = await supabase
    .from("crm_saved_views")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ view: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase
    .from("crm_saved_views")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
