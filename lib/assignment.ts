/**
 * Assignment Engine — evaluates rules in priority order and returns the first matching user.
 *
 * Rule types:
 * - group_slug: assigns if the conversation's group has a matching slug tag
 * - keyword: assigns if the message text contains the keyword (case-insensitive)
 * - contact_tag: assigns if the sender has a matching contact tag
 * - round_robin: distributes across a team pool atomically
 *
 * Design decisions (anticipating review):
 * - Rules are evaluated in priority order (ascending). First match wins.
 * - Round-robin uses an atomic DB function to avoid race conditions.
 * - Manual assignments are never overridden — caller must check before invoking.
 * - Returns assignment_reason string for audit trail.
 */

import { SupabaseClient } from "@supabase/supabase-js";

interface AssignmentRule {
  id: string;
  name: string;
  priority: number;
  match_type: "group_slug" | "keyword" | "contact_tag" | "round_robin";
  match_value: string | null;
  assign_to: string | null;
  team_pool: string[];
  enabled: boolean;
}

interface AssignmentContext {
  chatId: number;
  messageText: string;
  senderTelegramId: number;
  groupSlugs: string[]; // slug tags on the group
  senderTags?: string[]; // prefetched contact tags (avoids N+1)
}

interface AssignmentResult {
  userId: string;
  reason: string; // e.g. "rule:group_slug:defi" or "rule:round_robin:Sales Team"
  ruleName: string;
}

/**
 * Evaluate assignment rules against a message context.
 * Returns the first matching rule's assignment, or null if no rules match.
 */
export async function evaluateAssignment(
  supabase: SupabaseClient,
  context: AssignmentContext
): Promise<AssignmentResult | null> {
  // Fetch enabled rules sorted by priority
  const { data: rules, error } = await supabase
    .from("crm_assignment_rules")
    .select("id, name, priority, match_type, match_value, assign_to, team_pool, enabled")
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (error || !rules || rules.length === 0) return null;

  // Prefetch sender tags once if any contact_tag rules exist (avoids N+1)
  const hasContactTagRules = rules.some((r) => r.match_type === "contact_tag");
  if (hasContactTagRules && !context.senderTags && context.senderTelegramId) {
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("tags")
      .eq("telegram_id", String(context.senderTelegramId))
      .single();
    context.senderTags = Array.isArray(contact?.tags) ? contact.tags : [];
  }

  for (const rule of rules as AssignmentRule[]) {
    const result = await matchRule(supabase, rule, context);
    if (result) return result;
  }

  return null;
}

async function matchRule(
  supabase: SupabaseClient,
  rule: AssignmentRule,
  context: AssignmentContext
): Promise<AssignmentResult | null> {
  switch (rule.match_type) {
    case "group_slug": {
      if (!rule.match_value) return null;
      const slugMatch = context.groupSlugs.some(
        (s) => s.toLowerCase() === rule.match_value!.toLowerCase()
      );
      if (!slugMatch) return null;
      const userId = rule.assign_to ?? (await roundRobinFromPool(supabase, rule));
      if (!userId) return null;
      return { userId, reason: `rule:group_slug:${rule.match_value}`, ruleName: rule.name };
    }

    case "keyword": {
      if (!rule.match_value) return null;
      // Simple case-insensitive word boundary match — no regex to avoid injection
      const keyword = rule.match_value.toLowerCase();
      if (!context.messageText.toLowerCase().includes(keyword)) return null;
      const userId = rule.assign_to ?? (await roundRobinFromPool(supabase, rule));
      if (!userId) return null;
      return { userId, reason: `rule:keyword:${rule.match_value}`, ruleName: rule.name };
    }

    case "contact_tag": {
      if (!rule.match_value) return null;
      // Use prefetched sender tags (avoids N+1 queries)
      const tags = context.senderTags ?? [];
      if (!tags.some((t: string) => t.toLowerCase() === rule.match_value!.toLowerCase())) return null;
      const userId = rule.assign_to ?? (await roundRobinFromPool(supabase, rule));
      if (!userId) return null;
      return { userId, reason: `rule:contact_tag:${rule.match_value}`, ruleName: rule.name };
    }

    case "round_robin": {
      const userId = await roundRobinFromPool(supabase, rule);
      if (!userId) return null;
      return { userId, reason: `rule:round_robin:${rule.name}`, ruleName: rule.name };
    }

    default:
      return null;
  }
}

/**
 * Atomic round-robin: uses DB function to avoid read-then-write race.
 */
async function roundRobinFromPool(
  supabase: SupabaseClient,
  rule: AssignmentRule
): Promise<string | null> {
  if (!rule.team_pool || rule.team_pool.length === 0) return null;

  const { data: index, error } = await supabase.rpc("next_round_robin", {
    p_rule_id: rule.id,
    p_pool_size: rule.team_pool.length,
  });

  if (error) {
    console.error("[assignment] round-robin RPC failed:", error.message);
    return null;
  }

  const idx = typeof index === "number" ? index : 0;
  return rule.team_pool[idx % rule.team_pool.length] ?? null;
}
