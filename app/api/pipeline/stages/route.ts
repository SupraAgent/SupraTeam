import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

// Bulk update stages (reorder, rename, add, delete)
export async function PUT(request: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { stages } = await request.json();

  if (!Array.isArray(stages)) {
    return NextResponse.json({ error: "stages must be an array" }, { status: 400 });
  }

  // Get existing stage IDs
  const { data: existing } = await supabase
    .from("pipeline_stages")
    .select("id");

  const existingIds = new Set((existing ?? []).map((s) => s.id));
  const incomingIds = new Set(stages.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id));

  // Delete stages that were removed
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    // First nullify any deals pointing to deleted stages
    for (const id of toDelete) {
      await supabase.from("crm_deals").update({ stage_id: null }).eq("stage_id", id);
    }
    await supabase.from("pipeline_stages").delete().in("id", toDelete);
  }

  // Upsert remaining stages
  const upserts = stages.map((s: { id?: string; name: string; color?: string }, i: number) => ({
    ...(s.id ? { id: s.id } : {}),
    name: s.name,
    position: i + 1,
    color: s.color || null,
  }));

  // Separate new vs existing
  const toInsert = upserts.filter((s: { id?: string }) => !s.id);
  const toUpdate = upserts.filter((s: { id?: string }) => s.id);

  // Update existing
  for (const stage of toUpdate) {
    await supabase
      .from("pipeline_stages")
      .update({ name: stage.name, position: stage.position, color: stage.color })
      .eq("id", stage.id);
  }

  // Insert new
  if (toInsert.length > 0) {
    await supabase.from("pipeline_stages").insert(toInsert);
  }

  // Return fresh list
  const { data: updated } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("position");

  return NextResponse.json({ stages: updated ?? [], ok: true });
}
