import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * POST: Global AI assistant chat
 * Context-aware — knows the current page and CRM data.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }

  let body: {
    messages: { role: string; content: string }[];
    context?: {
      page?: string;
      workflowId?: string;
      workflowNodes?: unknown[];
      workflowEdges?: unknown[];
    };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const systemPrompt = buildSystemPrompt(body.context);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: body.messages.map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const rawText: string = data.content?.[0]?.text ?? "";

    // Try to extract structured workflow data if present
    const parsed = parseAIResponse(rawText);

    return NextResponse.json({ data: parsed, source: "ai" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseAIResponse(text: string): {
  reply: string;
  workflow?: { nodes: unknown[]; edges: unknown[]; action: "add" | "replace" };
} {
  // Try to find a JSON block with workflow data
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/```\s*([\s\S]*?)```/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed.nodes && parsed.edges) {
        // Extract reply text from before the code block
        const reply = text.replace(/```[\s\S]*?```/, "").trim() || parsed.reply || "Here's your workflow:";
        return {
          reply,
          workflow: {
            nodes: parsed.nodes,
            edges: parsed.edges,
            action: parsed.action || "replace",
          },
        };
      }
    } catch {
      // JSON parse failed, return as plain text
    }
  }

  // Try parsing the entire response as JSON
  try {
    const parsed = JSON.parse(text);
    if (parsed.nodes && parsed.edges) {
      return {
        reply: parsed.reply || "Here's your workflow:",
        workflow: {
          nodes: parsed.nodes,
          edges: parsed.edges,
          action: parsed.action || "replace",
        },
      };
    }
  } catch {
    // Not JSON
  }

  return { reply: text };
}

function buildSystemPrompt(context?: {
  page?: string;
  workflowId?: string;
  workflowNodes?: unknown[];
  workflowEdges?: unknown[];
}): string {
  const isWorkflowPage = context?.page?.startsWith("/automations/");

  let prompt = `You are SupraCRM AI, a helpful assistant for a Telegram-native CRM platform.
You help the team with deal management, contacts, Telegram groups, automations, and more.
Be concise and direct. Use short paragraphs. The user is a busy BD/marketing professional.

SupraCRM features:
- Pipeline: 7-stage Kanban board (Potential Client → Outreach → Calendly Sent → Video Call → Follow Up → MOU Signed → First Check Received)
- Board types: BD, Marketing, Admin
- Contacts: Telegram-linked contacts with lifecycle stages
- TG Groups: Bot-managed Telegram groups with slug-based access control
- Broadcasts: Bulk Telegram messages filtered by slugs
- Outreach: Multi-step automated Telegram campaigns
- Automations: Visual drag-and-drop workflow builder
- Email: Gmail integration with AI features
- Tasks: Deal-linked task management`;

  if (isWorkflowPage) {
    prompt += `

You are currently helping the user build a workflow automation. When the user describes an automation they want,
generate the React Flow nodes and edges as a JSON code block.

WORKFLOW NODE TYPES:

Triggers (exactly ONE per workflow):
- deal_stage_change: { from_stage?: string, to_stage?: string, board_type?: string }
- deal_created: { board_type?: string }
- email_received: { from_contains?: string, subject_contains?: string }
- tg_message: { chat_id?: string, keyword?: string }
- calendar_event: { calendar_id?: string, event_type?: "created"|"updated"|"upcoming", minutes_before?: number }
- webhook: {}
- manual: {}

Actions:
- send_telegram: { message: string, chat_id?: string } — supports {{deal_name}}, {{stage}}, {{contact_name}}, {{board_type}}, {{assigned_to}}
- send_email: { to?: string, subject: string, body: string }
- update_deal: { field: "stage"|"value"|"board_type"|"assigned_to", value: string }
- create_task: { title: string, description?: string, due_hours?: number }

Logic:
- condition: { field: string, operator: "equals"|"not_equals"|"contains"|"gt"|"lt"|"gte"|"lte"|"is_empty"|"is_not_empty", value: string }
- delay: { duration: number, unit: "minutes"|"hours"|"days" }

PIPELINE STAGES: Potential Client, Outreach, Calendly Sent, Video Call, Follow Up, MOU Signed, First Check Received

RESPONSE FORMAT when generating a workflow:
Provide a natural language explanation, then include a JSON code block:

\`\`\`json
{
  "reply": "Description of what was built",
  "nodes": [
    {
      "id": "ai_trigger_0",
      "type": "trigger",
      "position": { "x": 400, "y": 100 },
      "data": {
        "nodeType": "trigger",
        "triggerType": "deal_stage_change",
        "label": "Deal Stage Change",
        "config": { "to_stage": "MOU Signed" }
      }
    },
    {
      "id": "ai_action_1",
      "type": "action",
      "position": { "x": 400, "y": 260 },
      "data": {
        "nodeType": "action",
        "actionType": "send_telegram",
        "label": "Send Congrats",
        "config": { "message": "🎉 {{deal_name}} just signed MOU!" }
      }
    }
  ],
  "edges": [
    {
      "id": "ai_edge_0_1",
      "source": "ai_trigger_0",
      "target": "ai_action_1",
      "type": "smoothstep",
      "animated": true,
      "style": { "stroke": "hsl(142, 71%, 45%)", "strokeWidth": 2 }
    }
  ],
  "action": "replace"
}
\`\`\`

RULES:
- Each workflow has exactly ONE trigger node.
- Position nodes vertically: start at y:100, add 160px for each subsequent node.
- Center nodes at x:400.
- For condition nodes, "True" edges go from sourceHandle "true", "False" edges from sourceHandle "false".
- Use "replace" action when building from scratch, "add" when extending existing workflow.
- Node IDs: "ai_trigger_0", "ai_action_1", "ai_condition_2", "ai_delay_3", etc.
- Edge IDs: "ai_edge_{sourceIndex}_{targetIndex}"
- Always include animated: true on edges.
- Give descriptive labels to each node.`;

    if (context?.workflowNodes?.length) {
      const maxY = Math.max(
        100,
        ...(context.workflowNodes as { position?: { y: number } }[])
          .map((n) => n.position?.y ?? 0)
      );
      prompt += `

CURRENT WORKFLOW STATE (${context.workflowNodes.length} nodes, ${context.workflowEdges?.length ?? 0} edges):
Nodes: ${JSON.stringify(context.workflowNodes)}
Edges: ${JSON.stringify(context.workflowEdges)}
Bottom-most node Y position: ${maxY}
When adding nodes, start at y: ${maxY + 200} to avoid overlap.`;
    }
  }

  return prompt;
}
