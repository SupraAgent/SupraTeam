import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** GET /api/email/groups?connection_id=... */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const connectionId = req.nextUrl.searchParams.get("connection_id");
  if (!connectionId) {
    return NextResponse.json({ error: "connection_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_email_groups")
    .select("*, crm_email_group_threads(*), crm_email_group_contacts(*)")
    .eq("connection_id", connectionId)
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/email/groups — Create group (atomic position) */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { name?: string; color?: string; connection_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }
  if (body.name.trim().length > 100) {
    return NextResponse.json({ error: "Group name too long (max 100 chars)" }, { status: 400 });
  }
  if (!body.connection_id) {
    return NextResponse.json({ error: "connection_id is required" }, { status: 400 });
  }
  if (body.color && !HEX_COLOR_RE.test(body.color)) {
    return NextResponse.json({ error: "color must be a valid hex color (e.g. #3b82f6)" }, { status: 400 });
  }

  // Use atomic RPC for race-free position
  const { data, error } = await supabase.rpc("insert_email_group_atomic", {
    p_user_id: user.id,
    p_connection_id: body.connection_id,
    p_name: body.name.trim(),
    p_color: body.color ?? "#3b82f6",
  });

  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      return NextResponse.json({ error: `Group "${body.name.trim()}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch full group with nested relations for the client
  const { data: full } = await supabase
    .from("crm_email_groups")
    .select("*, crm_email_group_threads(*), crm_email_group_contacts(*)")
    .eq("id", data.id)
    .single();

  // Guarantee nested arrays exist so client .map() never crashes
  const result = full ?? { ...data, crm_email_group_threads: [], crm_email_group_contacts: [] };
  return NextResponse.json({ data: result }, { status: 201 });
}

/** DELETE /api/email/groups?id=... */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: deleted, error } = await supabase
    .from("crm_email_groups")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted?.length) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  return NextResponse.json({ data: { deleted: true } });
}

/** PATCH /api/email/groups — Update group (name, color, is_collapsed) */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { id?: string; name?: string; color?: string; is_collapsed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    if (body.name.length > 100) return NextResponse.json({ error: "name too long (max 100 chars)" }, { status: 400 });
    updates.name = body.name.trim();
  }
  if (body.color !== undefined) {
    if (!HEX_COLOR_RE.test(body.color)) return NextResponse.json({ error: "color must be a valid hex color" }, { status: 400 });
    updates.color = body.color;
  }
  if (body.is_collapsed !== undefined) updates.is_collapsed = body.is_collapsed;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_email_groups")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      return NextResponse.json({ error: "A group with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
