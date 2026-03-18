import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: groups, error } = await supabase
    .from("tg_groups")
    .select("*")
    .order("group_name");

  if (error) {
    console.error("[api/groups] error:", error);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }

  return NextResponse.json({ groups: groups ?? [] });
}
