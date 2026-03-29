import { NextResponse } from "next/server";
import { requireAuth, requireLeadRole } from "@/lib/auth-guard";

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

  // Fetch custom field values
  const { data: fieldValues } = await supabase
    .from("crm_deal_field_values")
    .select("field_id, value")
    .eq("deal_id", id);

  const custom_fields: Record<string, string> = {};
  for (const fv of fieldValues ?? []) {
    custom_fields[fv.field_id] = fv.value;
  }

  return NextResponse.json({ deal: { ...deal, assigned_profile }, custom_fields });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const DEAL_FIELDS = ["deal_name", "contact_id", "assigned_to", "board_type", "stage_id", "value", "probability", "telegram_chat_id", "telegram_chat_name", "telegram_chat_link", "tg_group_id", "expected_close_date", "outcome"];
  const raw = await request.json();
  const body: Record<string, unknown> = {};
  for (const key of DEAL_FIELDS) {
    if (key in raw) body[key] = raw[key];
  }

  // Atomically capture old value and set new value via RPC to avoid read-modify-write race
  let oldValue: number | null = null;
  if ("value" in body) {
    const { data: rpcOldValue } = await supabase.rpc("update_deal_value_returning_old", {
      p_deal_id: id,
      p_new_value: body.value ?? 0,
    });
    oldValue = rpcOldValue ?? null;
  }

  body.updated_at = new Date().toISOString();

  // Update remaining fields (value already set atomically by RPC if present)
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

  // Fire deal_value_change automation -- old value was captured atomically by RPC
  if ("value" in body && Number(deal.value ?? 0) !== Number(oldValue ?? 0)) {
    import("@/lib/automation-engine").then(({ evaluateAutomationRules }) =>
      evaluateAutomationRules({
        type: "deal_value_change",
        dealId: id,
        payload: {
          old_value: oldValue,
          new_value: deal.value,
          value: deal.value,
        },
      })
    ).catch((err) => console.error("[deal-patch] automation error:", err));
  }

  // Save custom field values
  if (raw.custom_fields && typeof raw.custom_fields === "object") {
    for (const [fieldId, val] of Object.entries(raw.custom_fields)) {
      if (val === null || val === "") {
        await supabase.from("crm_deal_field_values").delete().eq("deal_id", id).eq("field_id", fieldId);
      } else {
        await supabase.from("crm_deal_field_values").upsert(
          { deal_id: id, field_id: fieldId, value: String(val) },
          { onConflict: "deal_id,field_id" }
        );
      }
    }
  }

  return NextResponse.json({ deal, ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { error } = await supabase.from("crm_deals").delete().eq("id", id);

  if (error) {
    console.error("[api/deals/[id]] delete error:", error);
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
