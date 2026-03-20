import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const email = searchParams.get("email");
  const telegram = searchParams.get("telegram");
  const excludeId = searchParams.get("exclude");

  if (!name && !email && !telegram) {
    return NextResponse.json({ duplicates: [] });
  }

  // Build OR conditions for potential duplicates
  const conditions: string[] = [];
  if (name) conditions.push(`name.ilike.%${name}%`);
  if (email) conditions.push(`email.ilike.%${email}%`);
  if (telegram) conditions.push(`telegram_username.ilike.%${telegram}%`);

  let query = supabase
    .from("crm_contacts")
    .select("id, name, email, company, telegram_username, phone")
    .or(conditions.join(","))
    .limit(10);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data: duplicates, error } = await query;

  if (error) {
    console.error("[duplicates] error:", error);
    return NextResponse.json({ duplicates: [] });
  }

  return NextResponse.json({ duplicates: duplicates ?? [] });
}
