/**
 * POST /api/contacts/engagement — Recalculate engagement scores for all contacts
 * Combines: TG group activity, outreach reply rates, deal linkage, recency
 *
 * Score 0-100: higher = more engaged
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  // 1. Get all contacts
  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, telegram_user_id, telegram_username, last_activity_at, created_at");

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // 2. Fetch TG group member activity (linked to contacts via crm_contact_id)
  const { data: memberActivity } = await supabase
    .from("tg_group_members")
    .select("crm_contact_id, message_count_7d, message_count_30d, engagement_tier")
    .not("crm_contact_id", "is", null);

  // Aggregate per contact: sum across all groups
  const memberScores: Record<string, { msg7d: number; msg30d: number; tier: string }> = {};
  for (const m of memberActivity ?? []) {
    if (!m.crm_contact_id) continue;
    const existing = memberScores[m.crm_contact_id] ?? { msg7d: 0, msg30d: 0, tier: "dormant" };
    existing.msg7d += m.message_count_7d ?? 0;
    existing.msg30d += m.message_count_30d ?? 0;
    // Keep highest engagement tier
    const tierRank: Record<string, number> = { champion: 5, active: 4, casual: 3, lurker: 2, new: 1, dormant: 0 };
    if ((tierRank[m.engagement_tier] ?? 0) > (tierRank[existing.tier] ?? 0)) {
      existing.tier = m.engagement_tier;
    }
    memberScores[m.crm_contact_id] = existing;
  }

  // 3. Fetch outreach reply data
  const { data: enrollments } = await supabase
    .from("crm_outreach_enrollments")
    .select("contact_id, reply_count, last_reply_at")
    .not("contact_id", "is", null);

  const replyScores: Record<string, { totalReplies: number; lastReplyAt: string | null }> = {};
  for (const e of enrollments ?? []) {
    if (!e.contact_id) continue;
    const existing = replyScores[e.contact_id] ?? { totalReplies: 0, lastReplyAt: null };
    existing.totalReplies += e.reply_count ?? 0;
    if (e.last_reply_at && (!existing.lastReplyAt || e.last_reply_at > existing.lastReplyAt)) {
      existing.lastReplyAt = e.last_reply_at;
    }
    replyScores[e.contact_id] = existing;
  }

  // 4. Fetch deal counts per contact
  const { data: dealCounts } = await supabase
    .from("crm_deals")
    .select("contact_id")
    .eq("outcome", "open")
    .not("contact_id", "is", null);

  const dealCountMap: Record<string, number> = {};
  for (const d of dealCounts ?? []) {
    if (d.contact_id) dealCountMap[d.contact_id] = (dealCountMap[d.contact_id] ?? 0) + 1;
  }

  // 5. Calculate engagement score per contact
  const now = Date.now();
  let updated = 0;

  for (const contact of contacts) {
    const member = memberScores[contact.id];
    const replies = replyScores[contact.id];
    const dealCount = dealCountMap[contact.id] ?? 0;

    // Component 1: TG message activity (35%)
    // Cap at 100: 10+ messages in 7 days = max score
    const msg7d = member?.msg7d ?? 0;
    const msg30d = member?.msg30d ?? 0;
    const activityScore = Math.min(100, msg7d * 10 + msg30d * 2);

    // Component 2: Outreach responsiveness (25%)
    // Any replies = high engagement signal
    const totalReplies = replies?.totalReplies ?? 0;
    const replyScore = Math.min(100, totalReplies * 25);

    // Component 3: Recency (20%)
    // How recently were they active?
    const lastActivity = contact.last_activity_at
      ? new Date(contact.last_activity_at).getTime()
      : new Date(contact.created_at).getTime();
    const daysSinceActivity = (now - lastActivity) / 86400000;
    const recencyScore = Math.max(0, 100 - daysSinceActivity * 5); // Loses 5pts/day

    // Component 4: Deal engagement (20%)
    // Active deals = engaged
    const dealScore = Math.min(100, dealCount * 40);

    // Weighted average
    const engagement = Math.round(
      activityScore * 0.35 +
      replyScore * 0.25 +
      recencyScore * 0.20 +
      dealScore * 0.20
    );

    const clampedScore = Math.max(0, Math.min(100, engagement));

    await supabase.from("crm_contacts").update({
      engagement_score: clampedScore,
      engagement_updated_at: new Date().toISOString(),
    }).eq("id", contact.id);
    updated++;
  }

  return NextResponse.json({ updated });
}

/**
 * GET /api/contacts/engagement — Return contacts sorted by engagement score
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, name, company, telegram_username, engagement_score, lifecycle_stage, last_activity_at")
    .order("engagement_score", { ascending: false })
    .limit(50);

  return NextResponse.json({ contacts: contacts ?? [] });
}
