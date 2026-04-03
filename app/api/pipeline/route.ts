import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const boardType = searchParams.get("board_type");

  let query = supabase.from("pipeline_stages").select("*").order("position");

  if (boardType === "Applications") {
    // Applications board has its own dedicated stages
    query = query.eq("board_type", "Applications");
  } else if (boardType) {
    // Other specific boards use legacy shared stages (board_type IS NULL)
    query = query.is("board_type", null);
  }
  // No board_type param = return all stages (for pipeline page that shows all boards)

  const { data: stages, error } = await query;

  if (error) {
    console.error("[api/pipeline] error:", error);
    return NextResponse.json({ error: "Failed to fetch stages" }, { status: 500 });
  }

  return NextResponse.json({ stages, source: "supabase" });
}
