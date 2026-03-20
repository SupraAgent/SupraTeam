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
      pageData?: Record<string, unknown>;
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
  pageData?: Record<string, unknown>;
}): string {
  const page = context?.page ?? "/";

  let prompt = `You are SupraCRM AI, a helpful assistant for a Telegram-native CRM platform.
You help the team with deal management, contacts, Telegram groups, automations, and more.
Be concise and direct. Use short paragraphs. The user is a busy BD/marketing professional.

SupraCRM features:
- Pipeline: 7-stage Kanban board (Potential Client → Outreach → Calendly Sent → Video Call → Follow Up → MOU Signed → First Check Received)
- Board types: BD, Marketing, Admin
- Contacts: Telegram-linked contacts with lifecycle stages (lead, active, inactive, churned)
- TG Groups: Bot-managed Telegram groups with slug-based access control
- Broadcasts: Bulk Telegram messages filtered by slugs
- Outreach: Multi-step automated Telegram campaigns (sequences)
- Automations: Visual drag-and-drop workflow builder
- Email: Gmail integration with AI features (draft, compose, summarize, categorize)
- Tasks: Deal-linked task management with snooze and due dates
- Access Control: Slug-based matrix for managing user access to TG groups
- Docs: Internal documentation system
- Graph: Relationship network visualization`;

  // ── Per-page context ──────────────────────────────────────────

  if (page === "/" || page === "/dashboard") {
    prompt += `

CURRENT PAGE: Dashboard
You are helping the user understand their CRM dashboard. You can help with:
- Interpreting pipeline metrics (open deals, conversion rates, avg days per stage)
- Identifying stale deals and suggesting follow-up actions
- Understanding pipeline funnel health
- Suggesting next steps based on deal distribution
- Explaining what the dashboard widgets mean`;
  } else if (page === "/pipeline") {
    prompt += `

CURRENT PAGE: Pipeline (Kanban Board)
You are helping the user manage their deal pipeline. You can help with:
- Deal strategy: what to do at each stage, how to move deals forward
- Prioritizing deals based on value, age, or stage
- Suggesting outreach templates for specific stages
- Understanding why deals might be stuck
- Board management (BD vs Marketing vs Admin boards)
- Filtering and finding specific deals

PIPELINE STAGES (in order):
1. Potential Client — Initial contact identified
2. Outreach — Active outreach in progress
3. Calendly Sent — Calendly link sent to prospect
4. Video Call — Call scheduled or occurred
5. Follow Up — Post-call follow-up phase
6. MOU Signed — Legal agreement signed
7. First Check Received — Payment/first transaction completed`;
  } else if (page === "/contacts") {
    prompt += `

CURRENT PAGE: Contacts
You are helping the user manage CRM contacts. You can help with:
- Contact lifecycle stages: lead → active → inactive → churned
- Finding and deduplicating contacts
- Enrichment strategies (what info to collect)
- Quality scores and what they mean
- Bulk operations and tagging
- Linking contacts to Telegram accounts
- Custom fields for contacts`;
  } else if (page === "/groups") {
    prompt += `

CURRENT PAGE: TG Groups
You are helping the user manage Telegram groups. You can help with:
- Group management: adding/removing the bot as admin
- Slug tagging: how to organize groups by slugs (e.g., "ecosystem", "defi", "gaming")
- Engagement scores and what they indicate
- Member tracking and activity tiers
- Linking deals to specific groups
- Group health metrics (message volume, active members)
- Bulk operations: add/remove users from all groups with a given slug`;
  } else if (page === "/broadcasts") {
    prompt += `

CURRENT PAGE: Broadcasts
You are helping the user send broadcast messages. You can help with:
- Composing effective broadcast messages
- Targeting: filtering by slugs to reach the right groups
- Scheduling broadcasts for optimal timing
- Personalization with template variables: {{deal_name}}, {{contact_name}}, {{stage}}
- Reviewing delivery stats (sent, delivered, failed)
- Best practices for Telegram broadcast frequency`;
  } else if (page === "/outreach") {
    prompt += `

CURRENT PAGE: Outreach Sequences
You are helping the user create and manage outreach sequences. You can help with:
- Designing multi-step outreach campaigns
- Writing compelling outreach messages for each step
- Setting optimal delays between steps (hours/days)
- Enrollment strategies: which contacts to enroll
- Analyzing sequence performance
- A/B testing message variations
- When to stop a sequence and escalate to manual outreach`;
  } else if (page === "/email") {
    prompt += `

CURRENT PAGE: Email
You are helping the user with their email workflow. You can help with:
- Drafting and composing professional emails
- Summarizing long email threads
- Adjusting email tone (formal, casual, urgent, friendly)
- Email search with natural language queries
- Categorizing emails (VIP, action required, FYI, newsletter)
- Email best practices for BD and partnership outreach
- Following up on unanswered emails`;
  } else if (page === "/tasks") {
    prompt += `

CURRENT PAGE: Tasks
You are helping the user manage their tasks. You can help with:
- Task prioritization and planning
- Creating tasks from deal context
- Setting appropriate due dates
- Snoozing tasks for later
- Linking tasks to specific deals
- Organizing daily/weekly task workflow`;
  } else if (page === "/conversations") {
    prompt += `

CURRENT PAGE: Conversations
You are helping the user manage Telegram conversations. You can help with:
- Understanding conversation context and history
- Suggesting responses to messages
- Identifying hot conversations that need attention
- Analyzing conversation sentiment and tone
- Flagging conversations that may need escalation`;
  } else if (page.startsWith("/access")) {
    prompt += `

CURRENT PAGE: Access Control
You are helping the user manage slug-based access control. You can help with:
- Understanding the slug → group mapping
- Adding/removing users from slug groups (bulk operations)
- Auditing who has access to what
- Setting up new slug categories
- Access control best practices for team management`;
  } else if (page.startsWith("/settings")) {
    prompt += `

CURRENT PAGE: Settings
You are helping the user configure SupraCRM. You can help with:
- Pipeline stage customization
- Team member roles (bd_lead, marketing_lead, admin_lead)
- Telegram bot configuration and connection
- Email integration setup (Gmail OAuth)
- Automation rules and webhook configuration
- Privacy/GDPR settings (data retention, export, deletion)
- Notification preferences`;
  } else if (page === "/graph") {
    prompt += `

CURRENT PAGE: Graph
You are helping the user understand their relationship network. You can help with:
- Interpreting the connection graph between contacts, deals, and groups
- Identifying key relationship clusters
- Finding indirect connections between contacts
- Understanding network centrality and influence`;
  } else if (page === "/docs") {
    prompt += `

CURRENT PAGE: Docs
You are helping the user with internal documentation. You can help with:
- Organizing CRM documentation
- Writing process docs for the team
- Linking docs to relevant CRM entities
- Finding information across existing docs`;
  }

  if (page.match(/^\/automations\/[^/]+$/)) {
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
