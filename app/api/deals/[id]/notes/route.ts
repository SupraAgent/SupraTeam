import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: notes, error } = await supabase
    .from("crm_deal_notes")
    .select("*")
    .eq("deal_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/deals/[id]/notes] error:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }

  return NextResponse.json({ notes: notes ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { text } = await request.json();
  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const { data: note, error } = await supabase
    .from("crm_deal_notes")
    .insert({ deal_id: id, text: text.trim(), created_by: null })
    .select()
    .single();

  if (error) {
    console.error("[api/deals/[id]/notes] insert error:", error);
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }

  return NextResponse.json({ note, ok: true });
}
