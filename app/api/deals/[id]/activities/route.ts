import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET: Unified deal activity timeline.
 * Reads from crm_deal_activities table + legacy sources (stage history, notes, notifications).
 * Supports filtering by activity_type.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("type"); // e.g., "meeting_scheduled,stage_change"
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

  try {
    // Fetch from unified activities table
    let query = auth.admin
      .from("crm_deal_activities")
      .select("id, activity_type, title, metadata, reference_id, reference_type, created_at, user_id")
      .eq("deal_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filter) {
      const types = filter.split(",").map((t) => t.trim());
      query = query.in("activity_type", types);
    }

    // Also fetch legacy sources that haven't been migrated yet
    const [activitiesRes, historyRes, notesRes] = await Promise.all([
      query,
      auth.admin
        .from("crm_deal_stage_history")
        .select("id, from_stage_id, to_stage_id, changed_at, from_stage:pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name)")
        .eq("deal_id", id)
        .order("changed_at", { ascending: false })
        .limit(limit),
      auth.admin
        .from("crm_deal_notes")
        .select("id, text, created_at")
        .eq("deal_id", id)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    // Merge activities from all sources
    interface ActivityItem {
      id: string;
      type: string;
      title: string;
      body?: string;
      metadata?: Record<string, unknown>;
      reference_id?: string;
      reference_type?: string;
      created_at: string;
    }

    const activities: ActivityItem[] = [];

    // Unified activities
    for (const a of activitiesRes.data ?? []) {
      activities.push({
        id: a.id,
        type: a.activity_type,
        title: a.title,
        metadata: a.metadata,
        reference_id: a.reference_id ?? undefined,
        reference_type: a.reference_type ?? undefined,
        created_at: a.created_at,
      });
    }

    // Legacy stage changes (deduplicate against unified activities)
    const unifiedStageIds = new Set(
      (activitiesRes.data ?? [])
        .filter((a) => a.activity_type === "stage_change")
        .map((a) => (a.metadata as Record<string, string>)?.history_id)
        .filter(Boolean)
    );

    if (!filter || filter.includes("stage_change")) {
      for (const h of historyRes.data ?? []) {
        if (unifiedStageIds.has(h.id)) continue;
        const fromName = (h.from_stage as unknown as { name: string } | null)?.name ?? "Unknown";
        const toName = (h.to_stage as unknown as { name: string } | null)?.name ?? "Unknown";
        activities.push({
          id: h.id,
          type: "stage_change",
          title: `Moved from ${fromName} to ${toName}`,
          created_at: h.changed_at,
        });
      }
    }

    // Legacy notes
    if (!filter || filter.includes("note_added")) {
      const unifiedNoteIds = new Set(
        (activitiesRes.data ?? [])
          .filter((a) => a.activity_type === "note_added")
          .map((a) => a.reference_id)
          .filter(Boolean)
      );

      for (const n of notesRes.data ?? []) {
        if (unifiedNoteIds.has(n.id)) continue;
        activities.push({
          id: n.id,
          type: "note_added",
          title: "Note added",
          body: n.text,
          created_at: n.created_at,
        });
      }
    }

    // Sort by date descending
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({
      data: activities.slice(0, limit),
      source: "deal_activities",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch activities";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
