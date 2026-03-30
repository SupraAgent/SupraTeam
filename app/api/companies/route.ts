import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { sanitizePostgrestValue } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  let query = supabase
    .from("crm_companies")
    .select("*, contacts:crm_contacts(count)")
    .order("name");

  if (search) {
    const sanitized = sanitizePostgrestValue(search);
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,domain.ilike.%${sanitized}%,industry.ilike.%${sanitized}%`);
    }
  }

  const { data: companies, error } = await query;

  if (error) {
    console.error("[api/companies] error:", error);
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }

  // Flatten contact count from Supabase aggregate
  const result = (companies ?? []).map((c) => ({
    ...c,
    contact_count: (c.contacts as unknown as { count: number }[])?.[0]?.count ?? 0,
    contacts: undefined,
  }));

  return NextResponse.json({ companies: result });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();
  const { name, domain, industry, website, description, logo_url, employee_count, location } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Check for existing company with same name
  const { data: existing } = await supabase
    .from("crm_companies")
    .select("id")
    .ilike("name", name.trim())
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "A company with this name already exists", existing_id: existing.id }, { status: 409 });
  }

  const { data: company, error } = await supabase
    .from("crm_companies")
    .insert({
      name,
      domain: domain || null,
      industry: industry || null,
      website: website || null,
      description: description || null,
      logo_url: logo_url || null,
      employee_count: employee_count ?? null,
      location: location || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/companies] insert error:", error);
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }

  return NextResponse.json({ company, ok: true });
}
