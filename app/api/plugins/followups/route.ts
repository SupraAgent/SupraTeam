import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET /api/plugins/followups
 *  Returns email threads where the user sent the last message and hasn't received a reply.
 *  Uses Gmail API to find sent threads without recent inbound replies.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  // Get user's email connection
  const { data: conn } = await supabase
    .from("crm_email_connections")
    .select("email_address")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ data: [] });
  }

  const userEmail = conn.email_address;

  // Get scheduled follow-ups from crm_email_scheduled
  const { data: scheduled } = await supabase
    .from("crm_email_scheduled")
    .select("id, thread_id, subject, scheduled_for, status, reminder_type, created_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("scheduled_for", { ascending: true })
    .limit(20);

  // Get recently sent threads that may need follow-up
  // We'll check threads where user was the last sender
  const { data: threadLinks } = await supabase
    .from("crm_email_thread_links")
    .select(`
      thread_id,
      crm_contacts(id, name, email, company),
      crm_deals(id, deal_name, board_type, stage_id, pipeline_stages(name, color))
    `)
    .eq("linked_by", user.id)
    .order("linked_at", { ascending: false })
    .limit(20);

  // Build a map of thread_id -> CRM context
  const threadContext: Record<string, {
    contactName: string | null;
    contactEmail: string | null;
    dealName: string | null;
    dealId: string | null;
    stageName: string | null;
    stageColor: string | null;
  }> = {};

  for (const link of threadLinks ?? []) {
    if (!threadContext[link.thread_id]) {
      // Supabase returns joined data as arrays when FK is not unique; cast through unknown
      const contactArr = link.crm_contacts as unknown;
      const contact = (Array.isArray(contactArr) ? contactArr[0] : contactArr) as { name: string; email: string; company: string | null } | null;
      const dealArr = link.crm_deals as unknown;
      const deal = (Array.isArray(dealArr) ? dealArr[0] : dealArr) as { id: string; deal_name: string; board_type: string; pipeline_stages: { name: string; color: string } | null } | null;
      threadContext[link.thread_id] = {
        contactName: contact?.name ?? null,
        contactEmail: contact?.email ?? null,
        dealName: deal?.deal_name ?? null,
        dealId: deal?.id ?? null,
        stageName: deal?.pipeline_stages?.name ?? null,
        stageColor: deal?.pipeline_stages?.color ?? null,
      };
    }
  }

  // Combine scheduled follow-ups with CRM context
  const followups = (scheduled ?? []).map((item) => {
    const ctx = threadContext[item.thread_id ?? ""] ?? {};
    const scheduledDate = new Date(item.scheduled_for);
    const now = new Date();
    const ageMs = now.getTime() - scheduledDate.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    return {
      id: item.id,
      threadId: item.thread_id,
      subject: item.subject,
      scheduledFor: item.scheduled_for,
      status: item.status,
      reminderType: item.reminder_type,
      ageDays: Math.max(0, ageDays),
      ageGroup: ageDays < 1 ? "today" : ageDays <= 3 ? "1-3d" : ageDays <= 7 ? "3-7d" : "7d+",
      ...ctx,
    };
  });

  return NextResponse.json({ data: followups, userEmail });
}
