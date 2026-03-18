import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
