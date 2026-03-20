/**
 * GET /api/privacy/export — Full GDPR data export for a contact or the requesting user.
 * Returns all personal data as JSON.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contact_id");

  const exportData: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    exported_by: user.id,
  };

  if (contactId) {
    // Export all data for a specific contact
    const [contact, deals, notes, fieldValues, consent, groupMembers] = await Promise.all([
      supabase.from("crm_contacts").select("*").eq("id", contactId).single(),
      supabase.from("crm_deals").select("*").eq("contact_id", contactId),
      supabase.from("crm_deal_notes").select("*").in(
        "deal_id",
        (await supabase.from("crm_deals").select("id").eq("contact_id", contactId)).data?.map((d) => d.id) ?? []
      ),
      supabase.from("crm_contact_field_values").select("*, field:crm_contact_fields(name)").eq("contact_id", contactId),
      supabase.from("crm_consent_records").select("*").eq("contact_id", contactId),
      supabase.from("tg_group_members").select("*").eq("crm_contact_id", contactId),
    ]);

    exportData.contact = contact.data;
    exportData.deals = deals.data ?? [];
    exportData.notes = notes.data ?? [];
    exportData.custom_fields = fieldValues.data ?? [];
    exportData.consent_records = consent.data ?? [];
    exportData.group_memberships = groupMembers.data ?? [];
  } else {
    // Export requesting user's own data
    const [profile, emailConnections, emailAudit, aiConversations, automationLogs] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("crm_email_connections").select("id, provider, email, created_at, last_synced_at").eq("user_id", user.id),
      supabase.from("crm_email_audit_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
      supabase.from("crm_ai_conversations").select("id, telegram_chat_id, user_message, ai_response, escalated, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("crm_automation_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]);

    exportData.profile = profile.data;
    exportData.email_connections = emailConnections.data ?? [];
    exportData.email_audit_log = emailAudit.data ?? [];
    exportData.ai_conversations = aiConversations.data ?? [];
    exportData.automation_logs = automationLogs.data ?? [];
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
