import { NextResponse } from "next/server";
import { requireApiKey, isError } from "@/lib/api-key-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApiKey(request, "read");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: contact, error } = await admin
    .from("crm_contacts")
    .select("*, stage:pipeline_stages(id, name, position)")
    .eq("id", id)
    .eq("created_by", auth.userId)
    .single();

  if (error || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json({ data: contact });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApiKey(request, "write");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const ALLOWED_FIELDS = [
    "name",
    "email",
    "phone",
    "telegram_username",
    "telegram_user_id",
    "company",
    "company_id",
    "title",
    "notes",
    "stage_id",
    "lifecycle_stage",
    "source",
    "x_handle",
    "wallet_address",
    "wallet_chain",
  ];

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in raw) body[key] = raw[key];
  }

  if (Object.keys(body).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  body.updated_at = new Date().toISOString();

  const { data: contact, error } = await admin
    .from("crm_contacts")
    .update(body)
    .eq("id", id)
    .eq("created_by", auth.userId)
    .select("*, stage:pipeline_stages(id, name, position)")
    .single();

  if (error || !contact) {
    console.error("[api/v1/contacts/[id]] update error:", error);
    return NextResponse.json(
      { error: "Contact not found or update failed" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: contact });
}
