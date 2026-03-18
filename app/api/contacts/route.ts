import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  // TODO: Re-enable auth check once Telegram login works
  // const { data: { user } } = await supabase.auth.getUser();
  // if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  let query = supabase
    .from("crm_contacts")
    .select("*")
    .order("name");

  if (search) {
    query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,telegram_username.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data: contacts, error } = await query;

  if (error) {
    console.error("[api/contacts] error:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }

  return NextResponse.json({ contacts: contacts ?? [], source: "supabase" });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  // TODO: Re-enable auth check once Telegram login works
  const { data: { user } } = await supabase.auth.getUser();
  // if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, email, phone, telegram_username, telegram_user_id, company, title, notes } = body;

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
      created_by: user?.id || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/contacts] insert error:", error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }

  return NextResponse.json({ contact, ok: true });
}
