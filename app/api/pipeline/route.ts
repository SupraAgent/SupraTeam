import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  // TODO: Switch back to user-scoped createClient() once Telegram login works
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data: stages, error } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("position");

  if (error) {
    console.error("[api/pipeline] error:", error);
    return NextResponse.json({ error: "Failed to fetch stages" }, { status: 500 });
  }

  return NextResponse.json({ stages, source: "supabase" });
}
