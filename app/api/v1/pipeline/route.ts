import { NextResponse } from "next/server";
import { requireApiKey, isError } from "@/lib/api-key-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireApiKey(request, "read");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const boardType = searchParams.get("board_type");

  let query = admin
    .from("pipeline_stages")
    .select("*")
    .order("position");

  if (boardType) {
    query = query.is("board_type", null);
  }

  const { data: stages, error } = await query;

  if (error) {
    console.error("[api/v1/pipeline] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stages" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: stages ?? [] });
}
