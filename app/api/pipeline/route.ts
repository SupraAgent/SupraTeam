import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

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
