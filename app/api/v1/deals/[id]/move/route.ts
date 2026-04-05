import { NextResponse } from "next/server";
import { requireApiKey, isError } from "@/lib/api-key-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApiKey(request, "write");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { stage_id } = body;
  if (!stage_id) {
    return NextResponse.json(
      { error: "stage_id is required" },
      { status: 400 }
    );
  }

  // Verify the stage exists
  const { data: stage } = await admin
    .from("pipeline_stages")
    .select("id, name")
    .eq("id", stage_id)
    .single();

  if (!stage) {
    return NextResponse.json(
      { error: "Invalid stage_id" },
      { status: 400 }
    );
  }

  const { data: deal, error } = await admin
    .from("crm_deals")
    .update({
      stage_id,
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("created_by", auth.userId)
    .select(
      `*, stage:pipeline_stages(id, name, position)`
    )
    .single();

  if (error || !deal) {
    return NextResponse.json(
      { error: "Deal not found or move failed" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: deal });
}
