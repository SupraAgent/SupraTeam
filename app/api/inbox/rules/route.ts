/**
 * GET /api/inbox/rules — List all assignment rules (ordered by priority)
 * POST /api/inbox/rules — Create a new rule
 * PATCH /api/inbox/rules — Update a rule (fields, priority, enabled)
 * DELETE /api/inbox/rules — Delete a rule (?id=)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data, error } = await supabase
    .from("crm_assignment_rules")
    .select("id, name, priority, match_type, match_value, assign_to, team_pool, enabled, created_by, created_at, updated_at")
    .order("priority", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  let body: {
    name?: string;
    match_type?: string;
    match_value?: string;
    assign_to?: string | null;
    team_pool?: string[];
    priority?: number;
    enabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Rule name required" }, { status: 400 });
  }

  const validTypes = ["group_slug", "keyword", "contact_tag", "round_robin"];
  if (!body.match_type || !validTypes.includes(body.match_type)) {
    return NextResponse.json({ error: `match_type must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  // Validate: non-round_robin rules need either assign_to or team_pool
  if (body.match_type !== "round_robin" && !body.assign_to && (!body.team_pool || body.team_pool.length === 0)) {
    return NextResponse.json({ error: "assign_to or team_pool required" }, { status: 400 });
  }

  // Round-robin requires team_pool
  if (body.match_type === "round_robin" && (!body.team_pool || body.team_pool.length === 0)) {
    return NextResponse.json({ error: "team_pool required for round_robin rules" }, { status: 400 });
  }

  // Sanitize match_value — strip anything that could be problematic
  const safeMatchValue = body.match_value?.trim().replace(/[^a-zA-Z0-9 _-]/g, "") || null;

  const { data, error } = await supabase
    .from("crm_assignment_rules")
    .insert({
      name: body.name.trim(),
      match_type: body.match_type,
      match_value: safeMatchValue,
      assign_to: body.assign_to || null,
      team_pool: body.team_pool ?? [],
      priority: body.priority ?? 0,
      enabled: body.enabled ?? true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  let body: {
    id?: string;
    name?: string;
    match_type?: string;
    match_value?: string;
    assign_to?: string | null;
    team_pool?: string[];
    priority?: number;
    enabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (body.match_type !== undefined) {
    const validTypes = ["group_slug", "keyword", "contact_tag", "round_robin"];
    if (!validTypes.includes(body.match_type)) {
      return NextResponse.json({ error: `match_type must be one of: ${validTypes.join(", ")}` }, { status: 400 });
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.match_type !== undefined) update.match_type = body.match_type;
  if (body.match_value !== undefined) update.match_value = body.match_value?.trim().replace(/[^a-zA-Z0-9 _-]/g, "") || null;
  if (body.assign_to !== undefined) update.assign_to = body.assign_to;
  if (body.team_pool !== undefined) update.team_pool = body.team_pool;
  if (body.priority !== undefined) update.priority = body.priority;
  if (body.enabled !== undefined) update.enabled = body.enabled;

  const { data, error } = await supabase
    .from("crm_assignment_rules")
    .update(update)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule: data });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_assignment_rules")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
