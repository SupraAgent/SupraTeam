import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const stageFilter = searchParams.get("stage");

  let query = supabase
    .from("crm_contacts")
    .select("*, stage:pipeline_stages(*)")
    .order("name");

  if (search) {
    query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,telegram_username.ilike.%${search}%,email.ilike.%${search}%`);
  }

  if (stageFilter) {
    query = query.eq("stage_id", stageFilter);
  }

  const { data: contacts, error } = await query;

  if (error) {
    console.error("[api/contacts] error:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }

  return NextResponse.json({ contacts: contacts ?? [], source: "supabase" });
}

export async function POST(request: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json();
  const { name, email, phone, telegram_username, telegram_user_id, company, title, notes, stage_id } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data: contact, error } = await supabase
    .from("crm_contacts")
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      telegram_username: telegram_username || null,
      telegram_user_id: telegram_user_id || null,
      company: company || null,
      title: title || null,
      notes: notes || null,
      stage_id: stage_id || null,
      created_by: null,
    })
    .select("*, stage:pipeline_stages(*)")
    .single();

  if (error) {
    console.error("[api/contacts] insert error:", error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }

  return NextResponse.json({ contact, ok: true });
}
