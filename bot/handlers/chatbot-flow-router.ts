import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { executeChatbotFlow } from "./chatbot-flow-executor.js";

/**
 * Router that checks if an incoming message matches any active chatbot flow trigger.
 * If a flow_run is already in progress for the user+chat, routes to the flow executor.
 *
 * @returns true if the message was handled by a chatbot flow (caller should skip general AI agent)
 */

interface CachedFlow {
  id: string;
  trigger_type: string;
  trigger_keywords: string[];
  target_groups: number[];
  priority: number;
}

// ── Flow cache (refreshed every 60s) ──────────────────────────────

let cachedFlows: CachedFlow[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

async function loadActiveFlows(): Promise<CachedFlow[]> {
  if (Date.now() - cacheTimestamp < CACHE_TTL_MS && cachedFlows.length > 0) {
    return cachedFlows;
  }

  const { data } = await supabase
    .from("crm_chatbot_flows")
    .select("id, trigger_type, trigger_keywords, target_groups, priority")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  cachedFlows = (data ?? []) as CachedFlow[];
  cacheTimestamp = Date.now();
  return cachedFlows;
}

/**
 * Check if an incoming message matches any active chatbot flow.
 * Returns true if a flow handled the message (caller should skip general AI).
 */
export async function routeToChatbotFlow(
  bot: Bot,
  chatId: number,
  userId: number,
  messageText: string,
  isDM: boolean,
  isMention: boolean
): Promise<boolean> {
  // Check for an active flow run for this user+chat
  const { data: activeRun } = await supabase
    .from("crm_chatbot_flow_runs")
    .select("id, flow_id")
    .eq("telegram_user_id", userId)
    .eq("chat_id", chatId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (activeRun) {
    try {
      return await executeChatbotFlow(
        bot,
        activeRun.flow_id as string,
        chatId,
        userId,
        messageText,
        activeRun.id as string
      );
    } catch (err) {
      console.error("[chatbot-flow-router] resume error:", err);
      return false;
    }
  }

  // No active run -- check if message triggers a new flow
  const flows = await loadActiveFlows();

  for (const flow of flows) {
    // Check target group constraints
    if (flow.target_groups.length > 0 && !flow.target_groups.includes(chatId)) {
      continue;
    }

    let matches = false;

    switch (flow.trigger_type) {
      case "dm_start":
        matches = isDM;
        break;
      case "group_mention":
        matches = !isDM && isMention;
        break;
      case "keyword": {
        if (flow.trigger_keywords.length === 0) break;
        const lowerMsg = messageText.toLowerCase();
        matches = flow.trigger_keywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));
        break;
      }
      case "all_messages":
        matches = true;
        break;
    }

    if (matches) {
      try {
        return await executeChatbotFlow(bot, flow.id, chatId, userId, messageText);
      } catch (err) {
        console.error("[chatbot-flow-router] execute error:", err);
      }
    }
  }

  return false;
}
