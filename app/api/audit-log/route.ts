import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entity_type");
  const action = url.searchParams.get("action");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  let query = supabase
    .from("crm_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (entityType) query = query.eq("entity_type", entityType);
  if (action) query = query.eq("action", action);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] });
}
