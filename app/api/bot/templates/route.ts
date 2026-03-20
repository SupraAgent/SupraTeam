/**
 * GET /api/bot/templates — List all bot message templates
 * PUT /api/bot/templates — Update a template by key (with versioning)
 * POST /api/bot/templates — Create a new custom template
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

  let body: { template_key?: string; body_template?: string; is_active?: boolean; change_note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.template_key) {
    return NextResponse.json({ error: "template_key is required" }, { status: 400 });
  }

  // If body_template is changing, save a version snapshot first
  if (body.body_template !== undefined) {
    // Get current version count
    const { data: versions } = await admin
      .from("crm_template_versions")
      .select("version_number")
      .eq("template_key", body.template_key)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVersion = (versions?.[0]?.version_number ?? 0) + 1;

    // Get current template content before overwriting
    const { data: current } = await admin
      .from("crm_bot_templates")
      .select("body_template")
      .eq("template_key", body.template_key)
      .single();

    if (current) {
      await admin.from("crm_template_versions").insert({
        template_key: body.template_key,
        body_template: current.body_template,
        version_number: nextVersion,
        changed_by: user.id,
        change_note: body.change_note ?? null,
      });
    }
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

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: {
    template_key: string;
    name: string;
    body_template: string;
    description?: string;
    available_variables?: string[];
    category?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.template_key || !body.name || !body.body_template) {
    return NextResponse.json({ error: "template_key, name, and body_template required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("crm_bot_templates")
    .insert({
      template_key: body.template_key,
      name: body.name,
      body_template: body.body_template,
      description: body.description ?? null,
      available_variables: body.available_variables ?? [],
      category: body.category ?? "custom",
      updated_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/bot/templates] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, ok: true });
}
