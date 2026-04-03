import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface Suggestion {
  deal_id: string;
  deal_name: string;
  contact_name: string | null;
  board_type: string;
  value: number | null;
  stage_name: string | null;
  action: "follow_up" | "escalate" | "close";
  reason: string;
  urgency: "high" | "medium" | "low";
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: deals, error } = await supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, value, probability, health_score, updated_at, stage_changed_at, awaiting_response_since, outcome, contact:crm_contacts(name), stage:pipeline_stages(name)")
    .is("outcome", null)
    .order("updated_at", { ascending: true });

  if (error) {
    return NextResponse.json({ suggestions: [], error: error.message }, { status: 500 });
  }

  if (!deals || deals.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const now = Date.now();
  const suggestions: (Suggestion & { score: number })[] = [];

  for (const deal of deals) {
    const daysSinceUpdate = (now - new Date(deal.updated_at).getTime()) / 86400000;
    const contact = deal.contact as unknown as { name: string } | null;
    const stage = deal.stage as unknown as { name: string } | null;

    // Overdue response → follow up
    if (deal.awaiting_response_since) {
      const waitHours = (now - new Date(deal.awaiting_response_since).getTime()) / 3600000;
      if (waitHours >= 4) {
        suggestions.push({
          deal_id: deal.id,
          deal_name: deal.deal_name,
          contact_name: contact?.name ?? null,
          board_type: deal.board_type,
          value: deal.value,
          stage_name: stage?.name ?? null,
          action: "follow_up",
          reason: `Awaiting reply for ${Math.floor(waitHours)}h`,
          urgency: waitHours >= 24 ? "high" : "medium",
          score: waitHours,
        });
        continue;
      }
    }

    // Low health + has value → escalate
    if (deal.health_score != null && deal.health_score < 30 && (deal.value ?? 0) > 0) {
      suggestions.push({
        deal_id: deal.id,
        deal_name: deal.deal_name,
        contact_name: contact?.name ?? null,
        board_type: deal.board_type,
        value: deal.value,
        stage_name: stage?.name ?? null,
        action: "escalate",
        reason: `Health ${deal.health_score}% — needs attention`,
        urgency: deal.health_score < 15 ? "high" : "medium",
        score: 100 - (deal.health_score ?? 0),
      });
      continue;
    }

    // Stale 30+ days + low probability → close
    if (daysSinceUpdate >= 30 && (deal.probability ?? 50) < 30) {
      suggestions.push({
        deal_id: deal.id,
        deal_name: deal.deal_name,
        contact_name: contact?.name ?? null,
        board_type: deal.board_type,
        value: deal.value,
        stage_name: stage?.name ?? null,
        action: "close",
        reason: `Inactive ${Math.floor(daysSinceUpdate)}d, ${deal.probability ?? 0}% prob`,
        urgency: daysSinceUpdate >= 60 ? "high" : "low",
        score: daysSinceUpdate,
      });
      continue;
    }

    // Stale 14+ days → follow up
    if (daysSinceUpdate >= 14) {
      suggestions.push({
        deal_id: deal.id,
        deal_name: deal.deal_name,
        contact_name: contact?.name ?? null,
        board_type: deal.board_type,
        value: deal.value,
        stage_name: stage?.name ?? null,
        action: "follow_up",
        reason: `No activity for ${Math.floor(daysSinceUpdate)}d`,
        urgency: daysSinceUpdate >= 30 ? "high" : "medium",
        score: daysSinceUpdate * 0.5,
      });
    }
  }

  // Sort by urgency score descending, return top 3
  suggestions.sort((a, b) => b.score - a.score);
  const top3: Suggestion[] = suggestions.slice(0, 3).map(({ score: _score, ...rest }) => rest);

  return NextResponse.json({ suggestions: top3 });
}
