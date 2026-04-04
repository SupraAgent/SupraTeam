import type { SupabaseClient } from "@supabase/supabase-js";

interface MatchResult {
  contact: {
    id: string;
    name: string;
    email: string | null;
  };
  isNew: boolean;
}

/**
 * Find an existing contact by email, or create a new one.
 * Used by Calendly webhook, Fireflies webhook, and future email integrations.
 */
export async function matchOrCreateContact(
  admin: SupabaseClient,
  email: string,
  name: string,
  userId: string
): Promise<MatchResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Search for existing contact by email
  const { data: existing } = await admin
    .from("crm_contacts")
    .select("id, name, email")
    .eq("created_by", userId)
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update name if it was null/empty and we have a better one
    if (!existing.name && name) {
      await admin
        .from("crm_contacts")
        .update({ name })
        .eq("id", existing.id);
      existing.name = name;
    }
    return { contact: existing, isNew: false };
  }

  // Create new contact
  const { data: created, error } = await admin
    .from("crm_contacts")
    .insert({
      email: normalizedEmail,
      name: name || normalizedEmail,
      lifecycle_stage: "prospect",
      created_by: userId,
    })
    .select("id, name, email")
    .single();

  if (error) {
    // Handle race condition: another request created the contact between our check and insert
    if (error.code === "23505") {
      const { data: retry } = await admin
        .from("crm_contacts")
        .select("id, name, email")
        .eq("created_by", userId)
        .ilike("email", normalizedEmail)
        .limit(1)
        .single();

      if (retry) return { contact: retry, isNew: false };
    }
    throw new Error(`Failed to create contact: ${error.message}`);
  }

  return { contact: created, isNew: true };
}
