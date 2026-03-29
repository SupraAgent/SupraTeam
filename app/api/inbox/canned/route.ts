/**
 * GET /api/inbox/canned — List canned responses (optional ?q= search)
 * POST /api/inbox/canned — Create a canned response
 * PATCH /api/inbox/canned — Update a canned response
 * DELETE /api/inbox/canned — Delete a canned response (?id=)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.toLowerCase();

  let query = supabase
    .from("crm_canned_responses")
    .select("id, title, body, shortcut, category, usage_count, created_by, created_at")
    .order("usage_count", { ascending: false });

  if (q) {
    // Allowlist: only letters, numbers, spaces, hyphens
    const safeQ = q.replace(/[^a-z0-9 -]/g, "").trim();
    if (safeQ) {
      query = query.or(`title.ilike.%${safeQ}%,shortcut.ilike.%${safeQ}%,body.ilike.%${safeQ}%`);
    }
  }

  const { data, error } = await query.limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ responses: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  let body: { title?: string; body?: string; shortcut?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.title?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "Title and body required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_canned_responses")
    .insert({
      title: body.title.trim(),
      body: body.body.trim(),
      shortcut: body.shortcut?.trim() || null,
      category: body.category?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ response: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  let body: { id?: string; title?: string; body?: string; shortcut?: string; category?: string; increment_usage?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (body.increment_usage) {
    // Atomic increment via SQL function (avoids read-then-write race)
    const { error } = await supabase.rpc("increment_canned_usage", { row_id: body.id });
    if (error) {
      console.error("[canned] increment_canned_usage RPC failed:", error.message);
    }
    return NextResponse.json({ ok: true });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) update.title = body.title.trim();
  if (body.body !== undefined) update.body = body.body.trim();
  if (body.shortcut !== undefined) update.shortcut = body.shortcut?.trim() || null;
  if (body.category !== undefined) update.category = body.category?.trim() || null;

  const { data, error } = await supabase
    .from("crm_canned_responses")
    .update(update)
    .eq("id", body.id)
    .eq("created_by", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ response: data });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase.from("crm_canned_responses").delete().eq("id", id).eq("created_by", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
