import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { sendTMAPush } from "./push-notifications.js";

/**
 * Chatbot flow executor -- advances a user through a visual decision tree.
 * Called by the chatbot-flow-router when a matching flow is found.
 */

// ── Types (mirrored from components/chatbot-flows/types.ts for bot process) ──

interface FlowNode {
  id: string;
  type: string;
  data: {
    nodeType: string;
    label: string;
    config: Record<string, unknown>;
  };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface FlowRun {
  id: string;
  flow_id: string;
  telegram_user_id: number;
  chat_id: number;
  current_node_id: string | null;
  collected_data: Record<string, string | number>;
  status: string;
  started_at: string;
}

const ABANDON_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// ── Variable interpolation ─────────────────────────────────────────

function interpolateVars(text: string, data: Record<string, string | number>): string {
  return text.replace(/\{(\w+(?:\.\w+)*)\}/g, (match, key: string) => {
    // Support {collected.field} and {field} patterns
    const parts = key.split(".");
    let val: unknown = data;
    for (const part of parts) {
      if (val && typeof val === "object") val = (val as Record<string, unknown>)[part];
      else return match;
    }
    return val != null ? String(val) : match;
  });
}

// ── Response validation ────────────────────────────────────────────

function validateResponse(
  text: string,
  responseType: string,
  choices?: string[]
): { valid: boolean; normalized: string } {
  switch (responseType) {
    case "number": {
      const num = Number(text.trim());
      return { valid: !isNaN(num), normalized: String(num) };
    }
    case "email": {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return { valid: emailRe.test(text.trim()), normalized: text.trim().toLowerCase() };
    }
    case "phone": {
      const digits = text.replace(/\D/g, "");
      return { valid: digits.length >= 7 && digits.length <= 15, normalized: digits };
    }
    case "choice": {
      if (!choices || choices.length === 0) return { valid: true, normalized: text.trim() };
      const lower = text.trim().toLowerCase();
      const match = choices.find((c) => c.toLowerCase() === lower);
      if (match) return { valid: true, normalized: match };
      // Try numeric selection (1, 2, 3...)
      const idx = parseInt(text.trim()) - 1;
      if (idx >= 0 && idx < choices.length) return { valid: true, normalized: choices[idx] };
      return { valid: false, normalized: text.trim() };
    }
    default:
      return { valid: true, normalized: text.trim() };
  }
}

// ── Edge traversal ─────────────────────────────────────────────────

function getNextNode(edges: FlowEdge[], currentId: string, sourceHandle?: string): string | null {
  if (sourceHandle) {
    const edge = edges.find((e) => e.source === currentId && e.sourceHandle === sourceHandle);
    if (edge) return edge.target;
  }
  const edge = edges.find((e) => e.source === currentId && !e.sourceHandle);
  return edge?.target ?? edges.find((e) => e.source === currentId)?.target ?? null;
}

// ── Stats update ───────────────────────────────────────────────────

async function updateFlowStats(flowId: string, status: "completed" | "escalated", durationMs: number): Promise<void> {
  const durationSeconds = Math.round(durationMs / 1000);

  const { data: existing } = await supabase
    .from("crm_chatbot_flow_stats")
    .select("*")
    .eq("flow_id", flowId)
    .single();

  if (existing) {
    const totalRuns = (existing.total_runs as number) + 1;
    const completedRuns = status === "completed"
      ? (existing.completed_runs as number) + 1
      : (existing.completed_runs as number);
    const escalatedRuns = status === "escalated"
      ? (existing.escalated_runs as number) + 1
      : (existing.escalated_runs as number);
    const avgTime = status === "completed" && completedRuns > 0
      ? Math.round(((existing.avg_completion_time_seconds as number) * (existing.completed_runs as number) + durationSeconds) / completedRuns)
      : (existing.avg_completion_time_seconds as number);
    const conversionRate = totalRuns > 0 ? Number(((completedRuns / totalRuns) * 100).toFixed(2)) : 0;

    await supabase
      .from("crm_chatbot_flow_stats")
      .update({
        total_runs: totalRuns,
        completed_runs: completedRuns,
        escalated_runs: escalatedRuns,
        avg_completion_time_seconds: avgTime,
        conversion_rate: conversionRate,
        updated_at: new Date().toISOString(),
      })
      .eq("flow_id", flowId);
  } else {
    await supabase.from("crm_chatbot_flow_stats").insert({
      flow_id: flowId,
      total_runs: 1,
      completed_runs: status === "completed" ? 1 : 0,
      escalated_runs: status === "escalated" ? 1 : 0,
      avg_completion_time_seconds: status === "completed" ? durationSeconds : 0,
      conversion_rate: status === "completed" ? 100 : 0,
    });
  }
}

// ── CRM action execution ───────────────────────────────────────────

async function executeAction(
  config: Record<string, unknown>,
  collectedData: Record<string, string | number>,
  userId: number,
  chatId: number
): Promise<void> {
  const actionType = String(config.actionType ?? "");

  switch (actionType) {
    case "create_contact": {
      await supabase.from("crm_contacts").upsert({
        telegram_user_id: userId,
        name: String(collectedData.name ?? collectedData.first_name ?? ""),
        company: String(collectedData.company ?? ""),
        title: String(collectedData.role ?? ""),
        source: "chatbot_flow",
        lifecycle_stage: "lead",
        last_activity_at: new Date().toISOString(),
      }, { onConflict: "telegram_user_id" });
      break;
    }
    case "create_deal": {
      const dealName = interpolateVars(String(config.dealName ?? "{name} - Chatbot Lead"), collectedData);
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("position", 1)
        .limit(1)
        .single();

      if (stage) {
        const { data: contact } = await supabase
          .from("crm_contacts")
          .select("id")
          .eq("telegram_user_id", userId)
          .limit(1)
          .single();

        await supabase.from("crm_deals").insert({
          deal_name: dealName,
          contact_id: contact?.id ?? null,
          stage_id: stage.id,
          board_type: String(config.boardType ?? "BD"),
          outcome: "open",
          telegram_chat_id: chatId,
        });
      }
      break;
    }
    case "assign_to": {
      if (!config.assigneeId) break;
      const { data: contact } = await supabase
        .from("crm_contacts")
        .select("id")
        .eq("telegram_user_id", userId)
        .limit(1)
        .single();

      if (contact) {
        await supabase
          .from("crm_deals")
          .update({ assigned_to: config.assigneeId as string })
          .eq("contact_id", contact.id)
          .eq("outcome", "open");
      }
      break;
    }
    case "send_notification": {
      const message = config.notificationMessage
        ? interpolateVars(String(config.notificationMessage), collectedData)
        : "Chatbot flow notification";

      await supabase.from("crm_notifications").insert({
        type: "chatbot_flow",
        title: "Chatbot Flow",
        body: message,
      });
      break;
    }
    default:
      break;
  }
}

// ── Main executor ──────────────────────────────────────────────────

/**
 * Execute a chatbot flow step for an incoming message.
 * Finds or creates a flow_run, processes the current node, and advances.
 *
 * @returns true if the message was handled by the flow
 */
export async function executeChatbotFlow(
  bot: Bot,
  flowId: string,
  chatId: number,
  userId: number,
  message: string,
  existingRunId?: string
): Promise<boolean> {
  // Load flow
  const { data: flow } = await supabase
    .from("crm_chatbot_flows")
    .select("*")
    .eq("id", flowId)
    .single();

  if (!flow || !flow.is_active) return false;

  const flowData = flow.flow_data as unknown as FlowData;
  if (!flowData?.nodes?.length) return false;

  // Get or create flow run
  let run: FlowRun;

  if (existingRunId) {
    const { data } = await supabase
      .from("crm_chatbot_flow_runs")
      .select("*")
      .eq("id", existingRunId)
      .single();

    if (!data || (data.status as string) !== "active") return false;

    // Check for abandon timeout
    const startedAt = new Date((data.started_at ?? data.created_at) as string).getTime();
    if (Date.now() - startedAt > ABANDON_TIMEOUT_MS) {
      await supabase
        .from("crm_chatbot_flow_runs")
        .update({ status: "abandoned", completed_at: new Date().toISOString() })
        .eq("id", existingRunId);
      return false;
    }
    run = data as unknown as FlowRun;
  } else {
    // Find start node (first node with no incoming edges)
    const targetIds = new Set(flowData.edges.map((e) => e.target));
    const startNode = flowData.nodes.find((n) => !targetIds.has(n.id)) ?? flowData.nodes[0];

    const { data } = await supabase
      .from("crm_chatbot_flow_runs")
      .insert({
        flow_id: flowId,
        telegram_user_id: userId,
        chat_id: chatId,
        current_node_id: startNode.id,
        collected_data: {},
        status: "active",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!data) return false;
    run = data as unknown as FlowRun;
  }

  // Process current node and advance through auto-advancing nodes
  let currentNodeId: string | null = run.current_node_id;
  let collectedData = { ...run.collected_data };
  let iterations = 0;
  const maxIterations = 20; // Safety limit to prevent infinite loops

  while (currentNodeId && iterations < maxIterations) {
    iterations++;
    const node = flowData.nodes.find((n) => n.id === currentNodeId);
    if (!node) break;

    const config = (node.data.config ?? {}) as Record<string, unknown>;
    const nodeType = node.data.nodeType as string;

    // ── Message node: send text, auto-advance ──────────────────
    if (nodeType === "cb_message") {
      const text = interpolateVars(String(config.messageText ?? ""), collectedData);
      if (text) {
        await bot.api.sendMessage(chatId, text, {
          parse_mode: config.parseMode === "markdown" ? "Markdown" : undefined,
        });
      }
      currentNodeId = getNextNode(flowData.edges, currentNodeId);
      continue;
    }

    // ── Question node: ask or capture response ─────────────────
    if (nodeType === "cb_question") {
      const varName = String(config.variableName ?? "response");

      if (existingRunId) {
        // User is responding to this question
        const { valid, normalized } = validateResponse(
          message,
          String(config.responseType ?? "text"),
          config.choices as string[] | undefined
        );

        if (!valid) {
          const validationMsg = String(config.validationMessage ?? "Please provide a valid response.");
          await bot.api.sendMessage(chatId, validationMsg);
          // Stay on current node
          await supabase.from("crm_chatbot_flow_runs").update({
            collected_data: collectedData,
            current_node_id: currentNodeId,
          }).eq("id", run.id);
          return true;
        }

        collectedData[varName] = normalized;
        await supabase.from("crm_chatbot_flow_runs").update({
          collected_data: collectedData,
          current_node_id: getNextNode(flowData.edges, currentNodeId),
        }).eq("id", run.id);

        currentNodeId = getNextNode(flowData.edges, currentNodeId);
        existingRunId = run.id; // Mark as continuing run for subsequent questions
        continue;
      } else {
        // First time at this node: send the question and wait
        let questionText = interpolateVars(String(config.questionText ?? ""), collectedData);

        // Show numbered choices if applicable
        if (config.responseType === "choice" && Array.isArray(config.choices) && config.choices.length > 0) {
          const choiceList = (config.choices as string[])
            .map((c, i) => `${i + 1}. ${c}`)
            .join("\n");
          questionText = `${questionText}\n\n${choiceList}`;
        }

        if (questionText) {
          await bot.api.sendMessage(chatId, questionText);
        }

        await supabase.from("crm_chatbot_flow_runs").update({
          current_node_id: currentNodeId,
          collected_data: collectedData,
        }).eq("id", run.id);

        return true; // Pause execution, wait for user response
      }
    }

    // ── Condition node: branch based on collected data ──────────
    if (nodeType === "cb_condition") {
      const condType = String(config.conditionType ?? "response_contains");
      const field = String(config.field ?? "");
      const value = String(config.value ?? "");
      const fieldValue = String(collectedData[field] ?? "");

      let result = false;
      switch (condType) {
        case "response_contains":
          result = fieldValue.toLowerCase().includes(value.toLowerCase());
          break;
        case "response_matches_regex":
          try { result = new RegExp(value, "i").test(fieldValue); } catch { result = false; }
          break;
        case "collected_field_equals":
          result = fieldValue.toLowerCase() === value.toLowerCase();
          break;
        case "ai_intent_is":
          result = fieldValue.toLowerCase() === value.toLowerCase();
          break;
      }

      const branch = result ? "true" : "false";
      currentNodeId = getNextNode(flowData.edges, currentNodeId, branch);
      continue;
    }

    // ── Action node: execute CRM action, auto-advance ──────────
    if (nodeType === "cb_action") {
      await executeAction(config, collectedData, userId, chatId);
      currentNodeId = getNextNode(flowData.edges, currentNodeId);
      continue;
    }

    // ── AI node: call Anthropic API ────────────────────────────
    if (nodeType === "cb_ai") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const prompt = interpolateVars(String(config.promptTemplate ?? ""), collectedData);
      const varName = String(config.variableName ?? "ai_response");

      if (apiKey) {
        try {
          await bot.api.sendChatAction(chatId, "typing");

          const modelId = config.model === "haiku"
            ? "claude-haiku-4-20250414"
            : "claude-sonnet-4-20250514";

          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: modelId,
              max_tokens: Number(config.maxTokens ?? 300),
              messages: [{ role: "user", content: prompt }],
            }),
          });

          const json = await res.json();
          const aiText = (json.content ?? [])
            .filter((c: { type: string }) => c.type === "text")
            .map((c: { text: string }) => c.text)
            .join("");

          collectedData[varName] = aiText;

          if (aiText) {
            await bot.api.sendMessage(chatId, aiText);
          }
        } catch (err) {
          console.error("[chatbot-flow-executor] AI node error:", err);
          collectedData[varName] = "[AI response unavailable]";
        }
      } else {
        collectedData[varName] = "[AI not configured]";
      }

      currentNodeId = getNextNode(flowData.edges, currentNodeId);
      continue;
    }

    // ── Escalation node: hand off to human ─────────────────────
    if (nodeType === "cb_escalation") {
      const handoffMsg = interpolateVars(
        String(config.handoffMessage ?? "Connecting you with a team member..."),
        collectedData
      );
      await bot.api.sendMessage(chatId, handoffMsg);

      // Notify lead roles
      const roles = Array.isArray(config.notifyRoles) ? config.notifyRoles as string[] : ["bd_lead"];
      const { data: leads } = await supabase
        .from("profiles")
        .select("id")
        .in("crm_role", roles);

      if (leads) {
        for (const lead of leads) {
          sendTMAPush(bot, {
            userId: lead.id as string,
            triggerType: "escalation",
            title: `Chatbot escalation from user ${userId}`,
            body: String(config.reason ?? "User escalated from chatbot flow"),
            tmaPath: "/tma/inbox",
          }).catch((err) => console.error("[chatbot-flow-executor] escalation push error:", err));
        }
      }

      await supabase.from("crm_chatbot_flow_runs").update({
        status: "escalated",
        current_node_id: null,
        collected_data: collectedData,
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);

      // Update stats
      const startedAt = new Date(run.started_at).getTime();
      await updateFlowStats(flowId, "escalated", Date.now() - startedAt).catch((err) =>
        console.error("[chatbot-flow-executor] stats error:", err)
      );

      return true;
    }

    // ── Delay node: pause execution ────────────────────────────
    if (nodeType === "cb_delay") {
      // Store the next node so the user's next message advances past the delay
      const nextNodeId = getNextNode(flowData.edges, currentNodeId);
      await supabase.from("crm_chatbot_flow_runs").update({
        current_node_id: nextNodeId,
        collected_data: collectedData,
      }).eq("id", run.id);
      return true; // Wait for next user message
    }

    // Unknown node type: skip
    currentNodeId = getNextNode(flowData.edges, currentNodeId);
  }

  // Flow completed
  await supabase.from("crm_chatbot_flow_runs").update({
    status: "completed",
    current_node_id: null,
    collected_data: collectedData,
    completed_at: new Date().toISOString(),
  }).eq("id", run.id);

  // Update stats
  const startedAt = new Date(run.started_at).getTime();
  await updateFlowStats(flowId, "completed", Date.now() - startedAt).catch((err) =>
    console.error("[chatbot-flow-executor] stats error:", err)
  );

  return true;
}

/**
 * Abandon stale flow runs (no activity for 24h).
 * Called by cron job.
 */
export async function abandonStaleFlowRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - ABANDON_TIMEOUT_MS).toISOString();

  const { data, error } = await supabase
    .from("crm_chatbot_flow_runs")
    .update({ status: "abandoned", completed_at: new Date().toISOString() })
    .eq("status", "active")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[chatbot-flow-executor] abandon stale runs error:", error);
    return 0;
  }

  return data?.length ?? 0;
}
