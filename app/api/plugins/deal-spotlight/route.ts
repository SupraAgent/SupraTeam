import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/plugins/deal-spotlight
 * Returns email threads linked to active deals, color-coded by pipeline stage.
 * Also returns contacts with active deals whose emails could be auto-linked.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  // 1. Get all email-deal links for this user
  const { data: links } = await supabase
    .from("crm_email_thread_links")
    .select(`
      thread_id,
      auto_linked,
      linked_at,
      crm_deals(id, deal_name, board_type, value, outcome, stage_id, last_activity_at,
        pipeline_stages(id, name, color, position)
      ),
      crm_contacts(id, name, email, company)
    `)
    .eq("linked_by", user.id)
    .not("deal_id", "is", null)
    .order("linked_at", { ascending: false })
    .limit(50);

  // Filter to active deals and build spotlight entries
  const spotlightEntries: {
    threadId: string;
    dealId: string;
    dealName: string;
    boardType: string;
    value: number | null;
    stageName: string;
    stageColor: string;
    stagePosition: number;
    contactName: string | null;
    contactEmail: string | null;
    autoLinked: boolean;
    lastActivity: string | null;
  }[] = [];

  for (const link of links ?? []) {
    const dealRaw = link.crm_deals as unknown;
    const deal = (Array.isArray(dealRaw) ? dealRaw[0] : dealRaw) as {
      id: string; deal_name: string; board_type: string; value: number | null;
      outcome: string; last_activity_at: string | null;
      pipeline_stages: { id: string; name: string; color: string; position: number } | null;
    } | null;

    if (!deal || deal.outcome !== "open") continue;

    const contactRaw = link.crm_contacts as unknown;
    const contact = (Array.isArray(contactRaw) ? contactRaw[0] : contactRaw) as {
      id: string; name: string; email: string; company: string | null;
    } | null;

    spotlightEntries.push({
      threadId: link.thread_id,
      dealId: deal.id,
      dealName: deal.deal_name,
      boardType: deal.board_type,
      value: deal.value,
      stageName: deal.pipeline_stages?.name ?? "Unknown",
      stageColor: deal.pipeline_stages?.color ?? "#6b7280",
      stagePosition: deal.pipeline_stages?.position ?? 0,
      contactName: contact?.name ?? null,
      contactEmail: contact?.email ?? null,
      autoLinked: link.auto_linked,
      lastActivity: deal.last_activity_at,
    });
  }

  // 2. Get contacts with active deals that could be auto-linked (for "Link to deal?" prompts)
  const { data: dealContacts } = await supabase
    .from("crm_contacts")
    .select("id, name, email")
    .eq("created_by", user.id)
    .not("email", "is", null);

  // Get active deal counts per contact
  const contactEmails: string[] = [];
  for (const c of dealContacts ?? []) {
    if (c.email) contactEmails.push(c.email.toLowerCase());
  }

  return NextResponse.json({
    data: {
      entries: spotlightEntries,
      knownContactEmails: contactEmails,
    },
  });
}
