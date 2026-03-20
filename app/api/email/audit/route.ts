import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET: Return audit log entries for the current user */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);

  let query = auth.admin
    .from("crm_email_audit_log")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (action) {
    query = query.eq("action", action);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}
