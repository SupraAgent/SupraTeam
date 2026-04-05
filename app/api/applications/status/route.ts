import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Application pipeline stages in order */
const APPLICATION_STAGES = [
  "Submitted",
  "Under Review",
  "Shortlisted",
  "Approved",
  "Rejected",
] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference")?.trim().toUpperCase();
  const email = searchParams.get("email")?.trim().toLowerCase();

  if (!reference && !email) {
    return NextResponse.json(
      { error: "Provide both 'reference' and 'email' query parameters" },
      { status: 400 }
    );
  }

  // Require both reference AND email to prevent enumeration
  if (!reference || !email) {
    return NextResponse.json(
      { error: "Both 'reference' and 'email' are required for status lookup" },
      { status: 400 }
    );
  }

  // Rate limit by email — 20 lookups per minute (prevents brute-force enumeration)
  const limited = rateLimit(`app-status:${email}`, { max: 20, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Look up contact by email to verify ownership
  const { data: contact } = await admin
    .from("crm_contacts")
    .select("id")
    .eq("email", email)
    .single();

  if (!contact) {
    return NextResponse.json({ applications: [] });
  }

  // Build query: require both reference code AND contact match
  const query = admin
    .from("crm_deals")
    .select(`
      id,
      deal_name,
      reference_code,
      health_score,
      created_at,
      stage:pipeline_stages!stage_id(name)
    `)
    .eq("board_type", "Applications")
    .eq("reference_code", reference)
    .eq("contact_id", contact.id);

  const { data: deals, error } = await query.order("created_at", { ascending: false }).limit(10);

  if (error) {
    console.error("[applications/status] query error:", error);
    return NextResponse.json({ error: "Failed to look up applications" }, { status: 500 });
  }

  const applications = (deals ?? []).map((deal) => {
    // Supabase join can return array or object depending on relationship
    const stageRaw: unknown = deal.stage;
    const stageName = Array.isArray(stageRaw)
      ? (stageRaw[0] as { name: string } | undefined)?.name ?? "Unknown"
      : (stageRaw as { name: string } | null)?.name ?? "Unknown";
    const stageIndex = APPLICATION_STAGES.indexOf(stageName as typeof APPLICATION_STAGES[number]);
    const isTerminal = stageName === "Approved" || stageName === "Rejected";

    return {
      reference_code: deal.reference_code,
      project_name: deal.deal_name,
      current_stage: stageName,
      stage_index: stageIndex >= 0 ? stageIndex : 0,
      total_stages: APPLICATION_STAGES.length,
      is_terminal: isTerminal,
      score: deal.health_score,
      submitted_at: deal.created_at,
      stages: APPLICATION_STAGES.map((name, idx) => ({
        name,
        status: isTerminal && name === stageName
          ? (name === "Approved" ? "approved" : "rejected")
          : idx < stageIndex ? "completed"
          : idx === stageIndex ? "current"
          : "pending",
      })),
    };
  });

  return NextResponse.json({ applications });
}
