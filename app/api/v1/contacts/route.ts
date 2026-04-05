import { NextResponse } from "next/server";
import { requireApiKey, isError } from "@/lib/api-key-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireApiKey(request, "read");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const rawLimit = Number(searchParams.get("limit") ?? 50);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200);
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  let query = admin
    .from("crm_contacts")
    .select("*, stage:pipeline_stages(id, name, position)", { count: "exact" })
    .eq("created_by", auth.userId)
    .order("name");

  if (search) {
    // Escape PostgREST filter-significant characters to prevent filter injection
    const sanitized = search.replace(/[%_\\.,()]/g, "");
    if (sanitized) {
      query = query.or(
        `name.ilike.%${sanitized}%,company.ilike.%${sanitized}%,telegram_username.ilike.%${sanitized}%,email.ilike.%${sanitized}%`
      );
    }
  }

  query = query.range(offset, offset + limit - 1);

  const { data: contacts, error, count } = await query;

  if (error) {
    console.error("[api/v1/contacts] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: contacts ?? [],
    meta: { total: count ?? 0, limit, offset },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiKey(request, "write");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name,
    email,
    phone,
    telegram_username,
    telegram_user_id,
    company,
    company_id,
    title,
    notes,
    stage_id,
    lifecycle_stage,
    source,
  } = body;

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const { data: contact, error } = await admin
    .from("crm_contacts")
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      telegram_username: telegram_username || null,
      telegram_user_id: telegram_user_id || null,
      company: company || null,
      company_id: company_id || null,
      title: title || null,
      notes: notes || null,
      stage_id: stage_id || null,
      lifecycle_stage: lifecycle_stage || "prospect",
      source: source || "api",
      created_by: auth.userId,
    })
    .select("*, stage:pipeline_stages(id, name, position)")
    .single();

  if (error) {
    console.error("[api/v1/contacts] insert error:", error);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: contact }, { status: 201 });
}
