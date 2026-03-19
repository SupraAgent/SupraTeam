/**
 * GET /api/bot/templates — List all bot message templates
 * PUT /api/bot/templates — Update a template by key
 *
 * Body (PUT): { template_key: string, body_template: string, is_active?: boolean }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const { data, error } = await admin
    .from("crm_bot_templates")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/bot/templates] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: { template_key?: string; body_template?: string; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.template_key) {
    return NextResponse.json({ error: "template_key is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (body.body_template !== undefined) updates.body_template = body.body_template;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await admin
    .from("crm_bot_templates")
    .update(updates)
    .eq("template_key", body.template_key)
    .select()
    .single();

  if (error) {
    console.error("[api/bot/templates] PUT error:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}
