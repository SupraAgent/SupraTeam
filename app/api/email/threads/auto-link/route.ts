import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** POST: Auto-link a thread to matching CRM contacts/deals based on email addresses */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: {
    thread_id: string;
    from_emails: string[];
    to_emails: string[];
    provider?: string;
    email_account?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.thread_id || (!body.from_emails?.length && !body.to_emails?.length)) {
    return NextResponse.json({ error: "thread_id and at least one email list required" }, { status: 400 });
  }

  // Check if already linked
  const { data: existingLinks } = await auth.admin
    .from("crm_email_thread_links")
    .select("id")
    .eq("thread_id", body.thread_id)
    .eq("auto_linked", true)
    .limit(1);

  if (existingLinks && existingLinks.length > 0) {
    return NextResponse.json({ data: { already_linked: true, links: existingLinks }, source: "supabase" });
  }

  // Collect all email addresses from the thread
  const allEmails = [...new Set([...body.from_emails, ...body.to_emails].map((e) => e.toLowerCase()))];

  // Match against CRM contacts
  const { data: contacts } = await auth.admin
    .from("crm_contacts")
    .select("id, name, email")
    .in("email", allEmails);

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ data: { matched: false, links: [] }, source: "supabase" });
  }

  // Find deals for matched contacts
  const contactIds = contacts.map((c) => c.id);
  const { data: deals } = await auth.admin
    .from("crm_deals")
    .select("id, deal_name, contact_id")
    .in("contact_id", contactIds);

  // Create links
  const links: {
    thread_id: string;
    provider: string;
    email_account: string;
    deal_id: string | null;
    contact_id: string | null;
    linked_by: string;
    auto_linked: boolean;
  }[] = [];

  for (const contact of contacts) {
    const contactDeal = deals?.find((d) => d.contact_id === contact.id);

    links.push({
      thread_id: body.thread_id,
      provider: body.provider ?? "gmail",
      email_account: body.email_account ?? "",
      deal_id: contactDeal?.id ?? null,
      contact_id: contact.id,
      linked_by: auth.user.id,
      auto_linked: true,
    });
  }

  const { data: created, error } = await auth.admin
    .from("crm_email_thread_links")
    .insert(links)
    .select(`
      id, thread_id, deal_id, contact_id, auto_linked,
      crm_deals(id, deal_name, board_type),
      crm_contacts(id, name, email, company)
    `);

  if (error) {
    return NextResponse.json({ error: "Failed to auto-link" }, { status: 500 });
  }

  return NextResponse.json({ data: { matched: true, links: created }, source: "supabase" });
}
