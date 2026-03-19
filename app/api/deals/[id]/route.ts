import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: deal, error } = await supabase
    .from("crm_deals")
    .select(`
      *,
      contact:crm_contacts(*),
      stage:pipeline_stages(*)
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("[api/deals/[id]] error:", error);
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  let assigned_profile = null;
  if (deal.assigned_to) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", deal.assigned_to)
      .single();
    assigned_profile = profile;
  }

  return NextResponse.json({ deal: { ...deal, assigned_profile } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();

  if (body.stage_id) {
    const { data: current } = await supabase
      .from("crm_deals")
      .select("stage_id")
      .eq("id", id)
      .single();

    if (current && current.stage_id !== body.stage_id) {
      await supabase.from("crm_deal_stage_history").insert({
        deal_id: id,
        from_stage_id: current.stage_id,
        to_stage_id: body.stage_id,
        changed_by: user.id,
      });
      body.stage_changed_at = new Date().toISOString();
    }
  }

  body.updated_at = new Date().toISOString();

  const { data: deal, error } = await supabase
    .from("crm_deals")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[api/deals/[id]] update error:", error);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }

  return NextResponse.json({ deal, ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { error } = await supabase.from("crm_deals").delete().eq("id", id);

  if (error) {
    console.error("[api/deals/[id]] delete error:", error);
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
