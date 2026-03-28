/**
 * GET  /api/ai-agent/config — Get AI agent configuration
 * PUT  /api/ai-agent/config — Update configuration
 * POST /api/ai-agent/config — Create initial configuration
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: configs } = await supabase
    .from("crm_ai_agent_config")
    .select("*")
    .order("created_at")
    .limit(1);

  return NextResponse.json({ config: configs?.[0] ?? null });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();

  const { data, error } = await supabase
    .from("crm_ai_agent_config")
    .insert({
      name: body.name ?? "Default Agent",
      role_prompt: body.role_prompt ?? "You are a helpful assistant for Supra. Answer questions professionally and concisely.",
      knowledge_base: body.knowledge_base ?? null,
      qualification_fields: body.qualification_fields ?? ["company", "role", "interest", "budget_range"],
      auto_qualify: body.auto_qualify ?? false,
      respond_to_dms: body.respond_to_dms ?? false,
      respond_to_groups: body.respond_to_groups ?? false,
      respond_to_mentions: body.respond_to_mentions ?? true,
      max_tokens: body.max_tokens ?? 500,
      escalation_keywords: body.escalation_keywords ?? ["urgent", "speak to human", "manager", "pricing"],
      is_active: body.is_active ?? false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data, ok: true });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const allowed: Record<string, unknown> = {
    name: body.name,
    is_active: body.is_active,
    role_prompt: body.role_prompt,
    knowledge_base: body.knowledge_base,
    qualification_fields: body.qualification_fields,
    auto_qualify: body.auto_qualify,
    respond_to_dms: body.respond_to_dms,
    respond_to_groups: body.respond_to_groups,
    respond_to_mentions: body.respond_to_mentions,
    max_tokens: body.max_tokens,
    escalation_keywords: body.escalation_keywords,
    auto_create_deals: body.auto_create_deals,
    updated_at: new Date().toISOString(),
  };
  const updates = Object.fromEntries(
    Object.entries(allowed).filter(([, v]) => v !== undefined)
  );

  const { data, error } = await supabase
    .from("crm_ai_agent_config")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data, ok: true });
}
