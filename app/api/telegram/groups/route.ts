import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_GROUPS_PER_USER = 50;
const MAX_ICON_LENGTH = 50;

/** GET /api/telegram/groups — list all groups with members */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("crm_tg_chat_groups")
    .select("*, crm_tg_chat_group_members(*), crm_tg_chat_group_contacts(*)")
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/** POST /api/telegram/groups — create a group */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { name?: string; color?: string; icon?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  if (name.length > 100) return NextResponse.json({ error: "Name too long (max 100)" }, { status: 400 });
  if (body.color && !HEX_COLOR_RE.test(body.color)) {
    return NextResponse.json({ error: "Invalid hex color" }, { status: 400 });
  }
  if (body.icon && body.icon.length > MAX_ICON_LENGTH) {
    return NextResponse.json({ error: `Icon too long (max ${MAX_ICON_LENGTH})` }, { status: 400 });
  }

  // Insert atomically with count guard and position calc via SQL
  const { data, error } = await supabase.rpc("create_tg_chat_group", {
    p_name: name,
    p_color: body.color ?? "#3b82f6",
    p_icon: body.icon ?? null,
    p_max_groups: MAX_GROUPS_PER_USER,
  });

  if (error) {
    if (error.message?.includes("MAX_GROUPS_EXCEEDED")) {
      return NextResponse.json({ error: `Maximum ${MAX_GROUPS_PER_USER} groups allowed` }, { status: 429 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ error: `Group "${name}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }

  // Fetch the full group with relations
  const { data: group } = await supabase
    .from("crm_tg_chat_groups")
    .select("*, crm_tg_chat_group_members(*), crm_tg_chat_group_contacts(*)")
    .eq("id", data)
    .single();

  return NextResponse.json({ data: group }, { status: 201 });
}

/** PUT /api/telegram/groups — reorder groups (bulk position update) */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { order?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.order?.length) {
    return NextResponse.json({ error: "order array required" }, { status: 400 });
  }
  if (body.order.length > MAX_GROUPS_PER_USER) {
    return NextResponse.json({ error: "Too many groups" }, { status: 400 });
  }
  if (!body.order.every((id) => UUID_RE.test(id))) {
    return NextResponse.json({ error: "Invalid group ID format" }, { status: 400 });
  }

  // Update each group's position
  const updates = body.order.map((id, idx) =>
    supabase
      .from("crm_tg_chat_groups")
      .update({ position: idx })
      .eq("id", id)
      .eq("user_id", user.id)
  );

  const results = await Promise.allSettled(updates);
  const failed = results.filter((r) => {
    if (r.status === "rejected") return true;
    if (r.status === "fulfilled" && r.value.error) return true;
    return false;
  }).length;
  if (failed > 0) {
    return NextResponse.json({ error: "Some positions failed to update" }, { status: 500 });
  }

  return NextResponse.json({ data: { reordered: true } });
}

/** PATCH /api/telegram/groups — update group */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { id?: string; name?: string; color?: string; icon?: string; is_collapsed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!UUID_RE.test(body.id)) return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    if (trimmed.length > 100) return NextResponse.json({ error: "name too long" }, { status: 400 });
    updates.name = trimmed;
  }
  if (body.color !== undefined) {
    if (!HEX_COLOR_RE.test(body.color)) return NextResponse.json({ error: "Invalid hex color" }, { status: 400 });
    updates.color = body.color;
  }
  if (body.icon !== undefined) {
    if (body.icon && body.icon.length > MAX_ICON_LENGTH) {
      return NextResponse.json({ error: "Icon too long" }, { status: 400 });
    }
    updates.icon = body.icon;
  }
  if (body.is_collapsed !== undefined) {
    if (typeof body.is_collapsed !== "boolean") return NextResponse.json({ error: "is_collapsed must be boolean" }, { status: 400 });
    updates.is_collapsed = body.is_collapsed;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_tg_chat_groups")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Name already taken" }, { status: 409 });
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/** DELETE /api/telegram/groups?id=... */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_tg_chat_groups")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  return NextResponse.json({ data: { deleted: true } });
}
