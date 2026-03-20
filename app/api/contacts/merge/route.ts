import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { primaryId, mergeIds } = await request.json();

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

      for (const field of fillFields) {
        if (!primary[field]) {
          for (const mc of mergedContacts) {
            if (mc[field]) {
              updates[field] = mc[field];
              break;
            }
          }
        }
      }

      // Merge notes
      const allNotes = [primary.notes, ...mergedContacts.map((mc) => mc.notes)].filter(Boolean);
      if (allNotes.length > 1) {
        updates.notes = allNotes.join("\n---\n");
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
