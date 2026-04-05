import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET /api/email/thread-deals?thread_id=...&connection_id=...
 *  Reverse lookup: find all deals linked to a given email thread.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("thread_id");
  const connectionId = searchParams.get("connection_id");

  if (!threadId || !connectionId) {
    return NextResponse.json({ error: "thread_id and connection_id are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_deal_email_threads")
    .select("*, deal:crm_deals(deal_name, board_type)")
    .eq("thread_id", threadId)
    .eq("connection_id", connectionId)
    .order("linked_at", { ascending: false });

  if (error) {
    console.error("[api/email/thread-deals] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch linked deals" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
