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

  const { outcome } = body;
  const validOutcomes = ["won", "lost", "stalled", null];
  if (!validOutcomes.includes(outcome as string | null)) {
    return NextResponse.json(
      { error: "outcome must be won, lost, stalled, or null" },
      { status: 400 }
    );
  }

  const { data: deal, error } = await admin
    .from("crm_deals")
    .update({
      outcome: outcome ?? null,
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
      { error: "Deal not found or update failed" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: deal });
}
