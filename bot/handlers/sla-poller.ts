/**
 * SLA Response Time Poller
 * Checks deals with awaiting_response_since against SLA config.
 * Sends push notifications on warning and breach thresholds.
 * Runs every 5 minutes inside the bot process.
 */

import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { sendTMAPush } from "./push-notifications.js";

/**
 * Fire workflow automations for SLA events.
 * Uses dynamic import to avoid bundling the workflow engine in the bot process.
 */
async function fireWorkflowTriggers(triggerType: string, payload: Record<string, unknown>) {
  try {
    const [{ triggerWorkflowsByEvent }, { triggerLoopWorkflowsByEvent }] = await Promise.all([
      import("../../lib/workflow-engine"),
      import("../../lib/loop-workflow-engine"),
    ]);
    await Promise.allSettled([
      triggerWorkflowsByEvent(triggerType, payload),
      triggerLoopWorkflowsByEvent(triggerType, payload),
    ]);
  } catch (err) {
    console.error(`[bot/sla] ${triggerType} workflow trigger error:`, err);
  }
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface SlaConfig {
  id: string;
  board_type: string | null;
  warning_hours: number;
  breach_hours: number;
  escalate_to_role: string;
  is_active: boolean;
}

export function startSlaPoller(bot: Bot) {
  console.log("[bot/sla] Starting SLA poller (5m interval)");

  async function poll() {
    try {
      // Fetch active SLA configs
      const { data: configs } = await supabase
        .from("crm_sla_config")
        .select("*")
        .eq("is_active", true);

      if (!configs || configs.length === 0) return;

      // Fetch deals awaiting response
      const { data: deals } = await supabase
        .from("crm_deals")
        .select("id, deal_name, board_type, assigned_to, awaiting_response_since")
        .not("awaiting_response_since", "is", null)
        .eq("outcome", "open");

      if (!deals || deals.length === 0) return;

      // Batch-fetch recent SLA breaches for all awaiting deals (avoid N+1)
      const dealIds = deals.map((d) => d.id);
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
      const { data: recentBreaches } = await supabase
        .from("crm_sla_breaches")
        .select("deal_id, breach_type")
        .in("deal_id", dealIds)
        .gte("created_at", twoHoursAgo);

      const recentBreachSet = new Set(
        (recentBreaches ?? []).map((b) => `${b.deal_id}:${b.breach_type}`)
      );

      // Pre-fetch escalation users (cached for this poll cycle)
      const escalationRoles = [...new Set((configs as SlaConfig[]).map((c) => c.escalate_to_role).filter(Boolean))];
      const { data: escalationUsers } = await supabase
        .from("profiles")
        .select("id, crm_role")
        .in("crm_role", escalationRoles);

      const escalationUsersByRole = new Map<string, string[]>();
      for (const u of escalationUsers ?? []) {
        const list = escalationUsersByRole.get(u.crm_role) ?? [];
        list.push(u.id);
        escalationUsersByRole.set(u.crm_role, list);
      }

      for (const deal of deals) {
        if (!deal.awaiting_response_since) continue;

        const hoursElapsed = (Date.now() - new Date(deal.awaiting_response_since).getTime()) / 3600000;

        // Find matching SLA config (board-specific first, then global)
        const config = findSlaConfig(configs as SlaConfig[], deal.board_type);
        if (!config) continue;

        // Check breach threshold (higher priority, check first)
        if (hoursElapsed >= config.breach_hours) {
          if (!recentBreachSet.has(`${deal.id}:breach`)) {
            await handleSlaEvent(bot, deal, config, "breach", hoursElapsed, escalationUsersByRole);
          }
        } else if (hoursElapsed >= config.warning_hours) {
          if (!recentBreachSet.has(`${deal.id}:warning`)) {
            await handleSlaEvent(bot, deal, config, "warning", hoursElapsed, escalationUsersByRole);
          }
        }
      }
    } catch (err) {
      console.error("[bot/sla] poll error:", err);
    }
  }

  setTimeout(poll, 30_000); // First poll after 30s
  setInterval(poll, POLL_INTERVAL_MS);
}

function findSlaConfig(configs: SlaConfig[], boardType: string | null): SlaConfig | null {
  // Board-specific config takes precedence
  const specific = configs.find((c) => c.board_type === boardType);
  if (specific) return specific;
  // Fall back to global (board_type = null)
  return configs.find((c) => c.board_type === null) ?? null;
}

async function handleSlaEvent(
  bot: Bot,
  deal: { id: string; deal_name: string; board_type: string | null; assigned_to: string | null },
  config: SlaConfig,
  breachType: "warning" | "breach",
  hoursElapsed: number,
  escalationUsersByRole: Map<string, string[]>
) {
  // Record the breach
  await supabase.from("crm_sla_breaches").insert({
    deal_id: deal.id,
    breach_type: breachType,
    hours_elapsed: Math.round(hoursElapsed * 10) / 10,
  });

  // Fire workflow automations for SLA events (non-blocking)
  fireWorkflowTriggers(breachType === "breach" ? "sla_breach" : "sla_warning", {
    deal_id: deal.id,
    deal_name: deal.deal_name,
    board_type: deal.board_type,
    assigned_to: deal.assigned_to,
    hours_elapsed: Math.round(hoursElapsed * 10) / 10,
    threshold_hours: breachType === "breach" ? config.breach_hours : config.warning_hours,
  });

  const hoursLabel = `${Math.floor(hoursElapsed)}h ${Math.round((hoursElapsed % 1) * 60)}m`;
  const isBreached = breachType === "breach";
  const emoji = isBreached ? "\u26a0\ufe0f" : "\u23f0";
  const title = isBreached
    ? `${emoji} SLA Breach: ${deal.deal_name}`
    : `${emoji} SLA Warning: ${deal.deal_name}`;
  const body = `No response for ${hoursLabel} (${isBreached ? "breach" : "warning"} threshold: ${isBreached ? config.breach_hours : config.warning_hours}h)`;

  // Push to assigned rep
  if (deal.assigned_to) {
    sendTMAPush(bot, {
      userId: deal.assigned_to,
      triggerType: "escalation",
      title,
      body,
      tmaPath: `/tma/deals/${deal.id}`,
      dealId: deal.id,
    }).catch((err) => console.error("[bot/sla] push to rep error:", err));
  }

  // On breach: also push to escalation role users (pre-fetched)
  if (isBreached && config.escalate_to_role) {
    const userIds = escalationUsersByRole.get(config.escalate_to_role) ?? [];
    for (const uid of userIds) {
      if (uid === deal.assigned_to) continue; // Don't double-notify
      sendTMAPush(bot, {
        userId: uid,
        triggerType: "escalation",
        title,
        body: `${body}\nAssigned to: ${deal.assigned_to ? "rep" : "unassigned"}`,
        tmaPath: `/tma/deals/${deal.id}`,
        dealId: deal.id,
      }).catch((err) => console.error("[bot/sla] escalation push error:", err));
    }
  }

  console.warn(`[bot/sla] ${breachType} for deal ${deal.deal_name}: ${hoursLabel}`);
}
