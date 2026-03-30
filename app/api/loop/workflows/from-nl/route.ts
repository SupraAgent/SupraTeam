import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/auth-guard";
import { getAnthropicKey } from "@/lib/ai-key";

interface GeneratedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface GeneratedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

const SYSTEM_PROMPT = `You are a workflow graph generator for a Telegram-native CRM system called SupraCRM.
Given a plain-English description of a workflow, you produce a valid JSON object with "nodes" and "edges" arrays.

<node_types>
Each node has: id (string), type (string), position ({ x, y }), data (object).

TRIGGER NODES (type: "crmTriggerNode"):
data must include: nodeType: "trigger", label (string), crmTrigger (one of the types below), config (object, optional).
Available crmTrigger types:
- deal_stage_change — fires when a deal moves to a different pipeline stage
- deal_created — fires when a new deal is created
- deal_won — fires when a deal is marked as won
- deal_lost — fires when a deal is marked as lost
- deal_stale — fires when a deal has no activity for a configured period
- deal_value_change — fires when a deal's monetary value changes
- contact_created — fires when a new contact is added
- tg_message — fires when a Telegram message is received in a linked group
- tg_member_joined — fires when someone joins a Telegram group
- tg_member_left — fires when someone leaves a Telegram group
- email_received — fires when an email is received
- lead_qualified — fires when a lead passes qualification criteria
- scheduled — fires on a cron schedule (config: { cron: "0 9 * * 1" })
- task_overdue — fires when a task passes its due date
- calendar_event — fires on calendar events
- webhook — fires on incoming webhook requests
- manual — fires when manually triggered by a user
- bot_dm_received — fires when a DM is received by the Telegram bot

ACTION NODES (type: "crmActionNode"):
data must include: nodeType: "action", label (string), crmAction (one of the types below), config (object, optional).
Available crmAction types:
- send_telegram — send a Telegram message (config: { message: "text with {{deal.name}} merge vars" })
- send_email — send an email (config: { subject, body })
- send_slack — send a Slack message (config: { message })
- send_broadcast — send a broadcast to tagged groups
- update_deal — update deal fields (config: { field, value })
- update_contact — update contact fields
- assign_deal — assign a deal to a team member
- create_deal — create a new deal
- create_task — create a task (config: { title, due_in_days })
- add_tag — add a tag to a deal or contact
- remove_tag — remove a tag
- tg_manage_access — manage Telegram group access
- ai_summarize — generate an AI summary
- ai_classify — classify with AI
- add_to_sequence — add contact to an outreach sequence
- remove_from_sequence — remove contact from an outreach sequence
- http_request — make an HTTP request (config: { url, method, body })

CONDITION NODES (type: "crmConditionNode"):
data must include: nodeType: "condition", label (string), field, operator, value.
Available fields: board_type, stage, value, assigned_to, company, tags, lifecycle_stage, quality_score
Available operators: equals, not_equals, contains, not_contains, starts_with, gt, lt, gte, lte, is_empty, is_not_empty
Condition nodes have two output handles: "true" and "false".

DELAY NODES (type: "delayNode"):
data must include: nodeType: "delay", label (string), config: { duration: number, unit: "minutes" | "hours" | "days" }.
</node_types>

<edge_format>
Each edge has: id (string), source (node id), target (node id), sourceHandle (string | null).
- For trigger and action nodes, sourceHandle is null.
- For condition nodes, sourceHandle is "true" or "false".
</edge_format>

<positioning_rules>
- Start the trigger node at position { x: 100, y: 200 }.
- Place the next nodes 350px to the right (x += 350).
- For condition branches, offset the true path at y - 100 and false path at y + 100.
- Keep nodes spaced vertically by at least 150px when parallel.
- Every workflow MUST start with exactly one trigger node.
</positioning_rules>

<rules>
- Generate unique IDs like "trigger_1", "action_1", "condition_1", "delay_1", etc.
- Every non-trigger node must be connected as a target of at least one edge.
- The trigger node is always the first node and has no incoming edges.
- Use descriptive labels that match the user's intent.
- Include appropriate config values based on the description (e.g., message templates with merge variables like {{deal.name}}, {{contact.name}}).
- Return ONLY the JSON object. No explanation, no markdown fences.
</rules>`;

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const apiKey = await getAnthropicKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured. Add your Anthropic key in Settings > Integrations." },
      { status: 503 }
    );
  }

  let body: { description: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const description = body.description.trim().slice(0, 2000);

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate a workflow graph for the following description:\n\n${description}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from AI" }, { status: 502 });
    }

    let parsed: { nodes: GeneratedNode[]; edges: GeneratedEdge[] };
    try {
      // Strip markdown fences if present
      let raw = textBlock.text.trim();
      if (raw.startsWith("```")) {
        raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response as JSON" },
        { status: 502 }
      );
    }

    // Validate: must have nodes array with at least one trigger
    if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      return NextResponse.json(
        { error: "AI generated an empty workflow" },
        { status: 502 }
      );
    }

    const hasTrigger = parsed.nodes.some(
      (n) => n.type === "crmTriggerNode" || (n.data?.nodeType === "trigger")
    );
    if (!hasTrigger) {
      return NextResponse.json(
        { error: "Generated workflow has no trigger node" },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed.edges)) {
      parsed.edges = [];
    }

    return NextResponse.json({
      nodes: parsed.nodes,
      edges: parsed.edges,
    });
  } catch (err) {
    console.error("[from-nl] AI generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 }
    );
  }
}
