import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { executeDealMove } from "@/lib/deal-move";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { stage_id } = body;
  if (!stage_id || typeof stage_id !== "string") {
    return NextResponse.json({ error: "stage_id is required" }, { status: 400 });
  }

  const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";

  const result = await executeDealMove({
    dealId: id,
    toStageId: stage_id,
    changedByUserId: user.id,
    changedByName: userName,
  });

  if (!result.success) {
    if (result.error === "Deal not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ error: result.error ?? "Failed to move deal" }, { status: 500 });
  }

  if (result.fromStage === "same") {
    return NextResponse.json({ ok: true, moved: false });
  }

  // Auto-complete outreach sequences where this stage is the goal (API-specific)
  (async () => {
    try {
      const { data: enrollments } = await supabase
        .from("crm_outreach_enrollments")
        .select("id, sequence_id, contact_id")
        .eq("deal_id", id)
        .eq("status", "active");

      if (enrollments && enrollments.length > 0) {
        const seqIds = [...new Set(enrollments.map((e) => e.sequence_id))];
        const { data: goalSeqs } = await supabase
          .from("crm_outreach_sequences")
          .select("id")
          .in("id", seqIds)
          .eq("goal_stage_id", stage_id);

        if (goalSeqs && goalSeqs.length > 0) {
          const goalSeqIds = new Set(goalSeqs.map((s) => s.id));
          const toComplete = enrollments.filter((e) => goalSeqIds.has(e.sequence_id));

          for (const enrollment of toComplete) {
            await supabase
              .from("crm_outreach_enrollments")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", enrollment.id);

            if (enrollment.contact_id) {
              await supabase
                .from("crm_outreach_enrollments")
                .update({ status: "completed", completed_at: new Date().toISOString() })
                .eq("contact_id", enrollment.contact_id)
                .eq("status", "active")
                .in("sequence_id", [...goalSeqIds]);
            }
          }
          if (toComplete.length > 0) {
            console.log(`[move] Auto-completed ${toComplete.length} outreach enrollment(s) — goal stage reached`);
          }
        }
      }
    } catch (err) {
      console.error("[move] Goal completion error:", err);
    }
  })().catch(console.error);

  return NextResponse.json({ ok: true, moved: true, fromStage: result.fromStage, toStage: result.toStage });
}
