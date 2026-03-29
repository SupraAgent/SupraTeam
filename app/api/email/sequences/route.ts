import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET: List sequences or get specific sequence */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const { data, error } = await auth.admin
      .from("crm_email_sequences")
      .select("*")
      .eq("id", id)
      .eq("created_by", auth.user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }
    return NextResponse.json({ data, source: "supabase" });
  }

  const { data, error } = await auth.admin
    .from("crm_email_sequences")
    .select("*")
    .eq("created_by", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch sequences" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

/** POST: Create or update a sequence */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: {
    id?: string;
    name: string;
    description?: string;
    steps: { delay_days: number; template_id: string; subject_override?: string }[];
    board_type?: string;
    is_active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.steps?.length) {
    return NextResponse.json({ error: "name and steps are required" }, { status: 400 });
  }

  if (body.id) {
    const { data, error } = await auth.admin
      .from("crm_email_sequences")
      .update({
        name: body.name,
        description: body.description ?? null,
        steps: body.steps,
        board_type: body.board_type ?? null,
        is_active: body.is_active ?? true,
      })
      .eq("id", body.id)
      .eq("created_by", auth.user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update sequence" }, { status: 500 });
    }
    return NextResponse.json({ data, source: "supabase" });
  }

  const { data, error } = await auth.admin
    .from("crm_email_sequences")
    .insert({
      name: body.name,
      description: body.description ?? null,
      steps: body.steps,
      board_type: body.board_type ?? null,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create sequence" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

/** DELETE: Delete a sequence */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("crm_email_sequences")
    .delete()
    .eq("id", id)
    .eq("created_by", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
