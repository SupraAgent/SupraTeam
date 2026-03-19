import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

type Params = { params: Promise<{ id: string }> };

/** GET: Get deal/contact links for a thread */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { data, error } = await auth.admin
    .from("crm_email_thread_links")
    .select(`
      id, thread_id, deal_id, contact_id, auto_linked, linked_at,
      crm_deals(id, deal_name, board_type, stage_id),
      crm_contacts(id, name, email, company)
    `)
    .eq("thread_id", id)
    .eq("linked_by", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch links" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

/** POST: Create a manual thread ↔ deal/contact link */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let body: { deal_id?: string; contact_id?: string; provider?: string; email_account?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.deal_id && !body.contact_id) {
    return NextResponse.json({ error: "deal_id or contact_id required" }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("crm_email_thread_links")
    .insert({
      thread_id: id,
      provider: body.provider ?? "gmail",
      email_account: body.email_account ?? "",
      deal_id: body.deal_id ?? null,
      contact_id: body.contact_id ?? null,
      linked_by: auth.user.id,
      auto_linked: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create link" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

/** DELETE: Remove a thread link */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const linkId = searchParams.get("linkId");
  if (!linkId) {
    return NextResponse.json({ error: "linkId required" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("crm_email_thread_links")
    .delete()
    .eq("id", linkId)
    .eq("linked_by", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete link" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
