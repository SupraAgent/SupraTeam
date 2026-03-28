import { NextResponse } from "next/server";
import { requireLeadRole } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const body = await request.json();
  const { primaryId, mergeIds } = body;

  if (!primaryId || !mergeIds || !Array.isArray(mergeIds) || mergeIds.length === 0) {
    return NextResponse.json({ error: "primaryId and mergeIds[] required" }, { status: 400 });
  }

  // Move all deals from merged contacts to primary
  for (const mergeId of mergeIds) {
    await supabase
      .from("crm_deals")
      .update({ contact_id: primaryId, updated_at: new Date().toISOString() })
      .eq("contact_id", mergeId);
  }

  // fieldOverrides: optional { field: value } to explicitly set on primary (from merge preview)
  const fieldOverrides: Record<string, unknown> = body.fieldOverrides ?? {};

  // Merge enrichment data: fill empty fields on primary from merged contacts
  const { data: primary } = await supabase
    .from("crm_contacts")
    .select("*")
    .eq("id", primaryId)
    .single();

  if (primary) {
    const { data: mergedContacts } = await supabase
      .from("crm_contacts")
      .select("*")
      .in("id", mergeIds);

    if (mergedContacts) {
      const fillFields = ["email", "phone", "telegram_username", "telegram_user_id", "company", "title"];
      const updates: Record<string, unknown> = {};

      // Apply explicit field overrides first
      for (const [field, value] of Object.entries(fieldOverrides)) {
        if (fillFields.includes(field) || field === "notes" || field === "name") {
          updates[field] = value;
        }
      }

      // Auto-fill remaining empty fields
      for (const field of fillFields) {
        if (updates[field] !== undefined) continue; // Already overridden
        if (!primary[field]) {
          for (const mc of mergedContacts) {
            if (mc[field]) {
              updates[field] = mc[field];
              break;
            }
          }
        }
      }

      // Merge notes (unless overridden)
      if (updates.notes === undefined) {
        const allNotes = [primary.notes, ...mergedContacts.map((mc) => mc.notes)].filter(Boolean);
        if (allNotes.length > 1) {
          updates.notes = allNotes.join("\n---\n");
        }
      }

      // Merge custom fields
      if (primary.custom_fields || mergedContacts.some((mc) => mc.custom_fields)) {
        const mergedCustom = { ...(primary.custom_fields ?? {}) };
        for (const mc of mergedContacts) {
          if (mc.custom_fields) {
            for (const [k, v] of Object.entries(mc.custom_fields as Record<string, unknown>)) {
              if (!mergedCustom[k] && v) mergedCustom[k] = v;
            }
          }
        }
        if (Object.keys(mergedCustom).length > 0) {
          updates.custom_fields = mergedCustom;
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await supabase.from("crm_contacts").update(updates).eq("id", primaryId);
      }
    }
  }

  // Delete merged contacts
  await supabase.from("crm_contacts").delete().in("id", mergeIds);

  return NextResponse.json({ ok: true, merged: mergeIds.length });
}
