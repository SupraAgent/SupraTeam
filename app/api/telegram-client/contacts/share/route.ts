/**
 * POST /api/telegram-client/contacts/share
 * Share a private Telegram contact with the CRM (creates or links to crm_contact)
 *
 * Body: { privateContactId: string, crmContactId?: string }
 *
 * DELETE /api/telegram-client/contacts/share
 * Unshare a contact from the CRM
 *
 * Body: { privateContactId: string }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: { privateContactId?: string; crmContactId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.privateContactId) {
    return NextResponse.json({ error: "privateContactId required" }, { status: 400 });
  }

  // Verify user owns this private contact
  const { data: privateContact } = await admin
    .from("tg_private_contacts")
    .select("*")
    .eq("id", body.privateContactId)
    .eq("user_id", user.id)
    .single();

  if (!privateContact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  let crmContactId = body.crmContactId;

  // If no existing CRM contact specified, create one
  if (!crmContactId) {
    const displayName = [privateContact.first_name, privateContact.last_name]
      .filter(Boolean)
      .join(" ") || "Unknown";

    const { data: newContact, error: createError } = await admin
      .from("crm_contacts")
      .insert({
        name: displayName,
        telegram_username: privateContact.username,
        telegram_user_id: privateContact.telegram_user_id,
      })
      .select("id")
      .single();

    if (createError) {
      console.error("[tg-client/contacts/share] create contact error:", createError);
      return NextResponse.json({ error: "Failed to create CRM contact" }, { status: 500 });
    }
    crmContactId = newContact.id;
  }

  // Create share link
  const { error: shareError } = await admin.from("tg_shared_contacts").upsert(
    {
      private_contact_id: body.privateContactId,
      crm_contact_id: crmContactId,
      shared_by: user.id,
    },
    { onConflict: "private_contact_id,crm_contact_id" }
  );

  if (shareError) {
    console.error("[tg-client/contacts/share] share error:", shareError);
    return NextResponse.json({ error: "Failed to share contact" }, { status: 500 });
  }

  // Audit log
  await admin.from("tg_client_audit_log").insert({
    user_id: user.id,
    action: "share_contact",
    target_type: "contact",
    target_id: String(privateContact.telegram_user_id),
    metadata: { crm_contact_id: crmContactId },
  });

  return NextResponse.json({ ok: true, crmContactId });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: { privateContactId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.privateContactId) {
    return NextResponse.json({ error: "privateContactId required" }, { status: 400 });
  }

  // Verify ownership through the private contact
  const { data: privateContact } = await admin
    .from("tg_private_contacts")
    .select("id")
    .eq("id", body.privateContactId)
    .eq("user_id", user.id)
    .single();

  if (!privateContact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await admin
    .from("tg_shared_contacts")
    .delete()
    .eq("private_contact_id", body.privateContactId)
    .eq("shared_by", user.id);

  return NextResponse.json({ ok: true });
}
