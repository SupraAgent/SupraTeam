import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET: Get tracking events for a thread */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const trackingId = searchParams.get("tracking_id");
  const threadId = searchParams.get("thread_id");

  let query = auth.admin
    .from("crm_email_tracking_events")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("opened_at", { ascending: false });

  if (trackingId) {
    query = query.eq("tracking_id", trackingId);
  } else if (threadId) {
    query = query.eq("tracking_id", threadId);
  } else {
    return NextResponse.json({ error: "tracking_id or thread_id required" }, { status: 400 });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}
