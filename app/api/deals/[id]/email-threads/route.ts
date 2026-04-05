import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("crm_deal_email_threads")
    .select("*")
    .eq("deal_id", id)
    .order("linked_at", { ascending: false });

  if (error) {
    console.error("[api/deals/[id]/email-threads] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch linked email threads" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json();
  const { thread_id, connection_id, subject } = body as {
    thread_id?: string;
    connection_id?: string;
    subject?: string;
  };

  if (!thread_id || !connection_id) {
    return NextResponse.json({ error: "thread_id and connection_id are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_deal_email_threads")
    .upsert(
      {
        deal_id: id,
        thread_id,
        connection_id,
        subject: subject ?? null,
        linked_by: user.id,
      },
      { onConflict: "deal_id,thread_id,connection_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[api/deals/[id]/email-threads] POST error:", error);
    return NextResponse.json({ error: "Failed to link email thread" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const url = new URL(request.url);
  const threadId = url.searchParams.get("thread_id");
  const connectionId = url.searchParams.get("connection_id");

  if (!threadId || !connectionId) {
    return NextResponse.json({ error: "thread_id and connection_id query params are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_deal_email_threads")
    .delete()
    .eq("deal_id", id)
    .eq("thread_id", threadId)
    .eq("connection_id", connectionId);

  if (error) {
    console.error("[api/deals/[id]/email-threads] DELETE error:", error);
    return NextResponse.json({ error: "Failed to unlink email thread" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
