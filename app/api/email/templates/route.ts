import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET: List email templates */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const boardType = searchParams.get("board_type");

  let query = auth.admin
    .from("crm_email_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (boardType) {
    query = query.or(`board_type.eq.${boardType},board_type.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

/** POST: Create or update an email template */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { id?: string; name: string; subject?: string; body: string; variables?: string[]; board_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "name and body are required" }, { status: 400 });
  }

  if (body.id) {
    // Update
    const { data, error } = await auth.admin
      .from("crm_email_templates")
      .update({
        name: body.name,
        subject: body.subject ?? null,
        body: body.body,
        variables: body.variables ?? [],
        board_type: body.board_type ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
    }
    return NextResponse.json({ data, source: "supabase" });
  }

  // Create
  const { data, error } = await auth.admin
    .from("crm_email_templates")
    .insert({
      name: body.name,
      subject: body.subject ?? null,
      body: body.body,
      variables: body.variables ?? [],
      board_type: body.board_type ?? null,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

/** DELETE: Delete a template */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("crm_email_templates")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
