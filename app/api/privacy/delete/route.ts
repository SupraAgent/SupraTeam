/**
 * POST   /api/privacy/delete — Request deletion of a contact's personal data (GDPR right to erasure)
 * GET    /api/privacy/delete — List deletion requests
 * PATCH  /api/privacy/delete — Process a pending deletion request
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { decryptToken } from "@/lib/crypto";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: requests } = await supabase
    .from("crm_data_deletion_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ requests: requests ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { target_type, target_id, scope } = await request.json();

  if (!target_type || !["contact", "user_data"].includes(target_type)) {
    return NextResponse.json({ error: "target_type must be 'contact' or 'user_data'" }, { status: 400 });
  }

  if (target_type === "contact" && !target_id) {
    return NextResponse.json({ error: "target_id required for contact deletion" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_data_deletion_requests")
    .insert({
      requested_by: user.id,
      target_type,
      target_id: target_id || null,
      scope: scope ?? { contacts: true, deals: true, messages: true, notes: true },
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data, ok: true });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Get the request
  const { data: req } = await supabase
    .from("crm_data_deletion_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.status !== "pending") return NextResponse.json({ error: "Request already processed" }, { status: 400 });

  // Only the requester or an admin can process deletion requests
  const { data: profile } = await supabase
    .from("profiles")
    .select("crm_role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.crm_role === "admin_lead";
  if (req.requested_by !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Only the requester or an admin can process deletion requests" }, { status: 403 });
  }

  // Mark as processing
  await supabase.from("crm_data_deletion_requests").update({ status: "processing" }).eq("id", id);

  try {
    if (req.target_type === "contact" && req.target_id) {
      // Delete contact and all associated data
      const contactId = req.target_id;

      // Get deal IDs for this contact
      const { data: deals } = await supabase
        .from("crm_deals")
        .select("id")
        .eq("contact_id", contactId);
      const dealIds = (deals ?? []).map((d) => d.id);

      // Delete in order (respecting FK constraints)
      if (dealIds.length > 0) {
        await supabase.from("crm_deal_notes").delete().in("deal_id", dealIds);
        await supabase.from("crm_deal_stage_history").delete().in("deal_id", dealIds);
        await supabase.from("crm_deal_field_values").delete().in("deal_id", dealIds);
        await supabase.from("crm_outreach_enrollments").delete().in("deal_id", dealIds);
        await supabase.from("crm_deals").delete().eq("contact_id", contactId);
      }

      // Delete contact data
      await supabase.from("crm_contact_field_values").delete().eq("contact_id", contactId);
      await supabase.from("crm_consent_records").delete().eq("contact_id", contactId);
      await supabase.from("tg_group_members").delete().eq("crm_contact_id", contactId);
      await supabase.from("crm_contacts").delete().eq("id", contactId);
    }

    if (req.target_type === "user_data") {
      const userId = req.requested_by;

      // Revoke Google OAuth tokens before deleting connections
      const { data: connections } = await supabase
        .from("crm_email_connections")
        .select("id, access_token_encrypted")
        .eq("user_id", userId);

      for (const conn of connections ?? []) {
        if (conn.access_token_encrypted) {
          try {
            const token = decryptToken(conn.access_token_encrypted);
            await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
          } catch {
            // Non-fatal
          }
        }
      }

      // Delete all email-related records
      await supabase.from("crm_email_tracking_events").delete().eq("user_id", userId);
      await supabase.from("crm_email_push_events").delete().eq("user_id", userId);
      await supabase.from("crm_email_scheduled").delete().eq("user_id", userId);
      await supabase.from("crm_email_sequence_enrollments").delete().eq("enrolled_by", userId);
      await supabase.from("crm_email_thread_links").delete().eq("linked_by", userId);
      await supabase.from("crm_email_audit_log").delete().eq("user_id", userId);
      await supabase.from("crm_email_connections").delete().eq("user_id", userId);
    }

    // Mark as completed
    await supabase.from("crm_data_deletion_requests").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({ ok: true, status: "completed" });
  } catch (err) {
    await supabase.from("crm_data_deletion_requests").update({
      status: "failed",
      error_message: err instanceof Error ? err.message : "Unknown error",
    }).eq("id", id);

    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}
