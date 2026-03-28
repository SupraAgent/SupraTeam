import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/auth-guard";
import { sanitizeErrorMessage } from "@supra/loop-builder";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const {
    apiKey,
    message,
    currentNodes,
    currentEdges,
    canvasSummary,
    category,
    history,
  } = body;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Anthropic API key required. Set it in the builder settings." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are the Loop Builder Assistant for SupraCRM, a visual drag-and-drop automation builder. You help users build workflow flows, create custom nodes, and manage templates.

You operate inside a self-contained builder app with a drag-and-drop canvas. Users can build workflow chains where each node is a card that connects to others.

## Available Built-in Node Types

CORE NODES:
- personaNode: AI team members with { label, role, voteWeight, expertise[], personality, emoji }
- appNode: The user's app with { label, description, targetUsers, coreValue, currentState }
- competitorNode: Reference apps with { label, why, overallScore, cpoName }
- actionNode: Workflow steps with { label, actionType ("score"|"analyze"|"improve"|"generate"|"commit"), description }
- noteNode: Annotations with { label, content }
- stepNode: Pipeline steps with { label, stepIndex, subtitle, status ("pending"|"active"|"completed"), summary, flowCategory }
- consensusNode: Persona group bucket with { label, personas[], consensusScore }
- affinityCategoryNode: Scoring category with { label, weight, score, domainExpert }

WORKFLOW NODES:
- triggerNode: Start workflow with { label, triggerType ("manual"|"schedule"|"webhook"|"event"), config }
- conditionNode: Branch logic with { label, condition }. Has "true" and "false" source handles
- transformNode: Data transformation with { label, transformType, expression }
- outputNode: Send results with { label, outputType, destination }
- llmNode: AI/Claude node with { label, provider, model, systemPrompt, temperature?, maxTokens? }

INTEGRATION NODES:
- httpNode: Make API calls with { label, method, url, headers, body, timeout, authType, authValue }
- webhookNode: Receive HTTP calls with { label, webhookMethod, path, secret, responseCode, responseBody }
- emailNode: Send & read email with { label, emailAction, to, subject, body, format, provider }
- databaseNode: Query databases with { label, dbAction, dbType, connectionString, table, query, params }
- storageNode: File storage with { label, storageAction, provider, bucket, path, content }

DATA NODES:
- jsonNode, textNode, aggregatorNode, validatorNode, formatterNode

LOGIC NODES:
- loopNode, switchNode, delayNode, errorHandlerNode, mergeNode

AI NODES:
- classifierNode, summarizerNode, searchNode, embeddingNode, extractorNode

## Creating Custom User Nodes

When the user asks to create a new custom node type, respond with a \`\`\`user-node block:

\`\`\`user-node
{
  "label": "Node Name",
  "description": "What this node does",
  "emoji": "🔌",
  "color": "#818cf8",
  "inputs": 1,
  "outputs": 1,
  "fields": [
    { "key": "label", "label": "Label", "type": "text", "defaultValue": "Node Name" }
  ]
}
\`\`\`

## Creating / Modifying Flows

When the user asks to create or modify a flow, respond with a \`\`\`flow-json block:

\`\`\`flow-json
{ "nodes": [...], "edges": [...] }
\`\`\`

- Node positions: spread out (x: 0-1200, y: 0-600)
- Edges: use "smoothstep" type, can have animated: true
- Each node needs unique id, type, position {x, y}, and data object

## Saving Templates

If the user asks to save as a template:
\`\`\`save-template
{"name": "Template Name", "description": "What it does"}
\`\`\`

## Context

Current canvas category: "${category}"
Current canvas has ${currentNodes?.length ?? 0} nodes and ${currentEdges?.length ?? 0} edges.

This is the SupraCRM Loop Builder — focused on CRM automation workflows (deal management, Telegram bots, outreach sequences, etc). Keep responses concise.`;

  try {
    const messages = [
      ...(history ?? []).map(
        (h: { role: string; content: string }) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })
      ),
      {
        role: "user" as const,
        content: canvasSummary
          ? `Current canvas:\n${canvasSummary}\n\nUser request: ${message}`
          : `Current nodes: ${JSON.stringify(currentNodes?.slice(0, 50) ?? [])}\n\nCurrent edges: ${JSON.stringify(currentEdges?.slice(0, 50) ?? [])}\n\nUser request: ${message}`,
      },
    ];

    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    let flowUpdate = null;
    const flowMatch = text.match(/```flow-json\s*([\s\S]*?)```/);
    if (flowMatch) {
      try {
        flowUpdate = JSON.parse(flowMatch[1].trim());
      } catch {
        // Ignore parse errors
      }
    }

    let saveAsTemplate = null;
    const saveMatch = text.match(/```save-template\s*([\s\S]*?)```/);
    if (saveMatch) {
      try {
        saveAsTemplate = JSON.parse(saveMatch[1].trim());
      } catch {
        // Ignore parse errors
      }
    }

    let userNodeDef = null;
    const userNodeMatch = text.match(/```user-node\s*([\s\S]*?)```/);
    if (userNodeMatch) {
      try {
        userNodeDef = JSON.parse(userNodeMatch[1].trim());
      } catch {
        // Ignore parse errors
      }
    }

    const cleanMessage = text
      .replace(/```flow-json[\s\S]*?```/g, "")
      .replace(/```save-template[\s\S]*?```/g, "")
      .replace(/```user-node[\s\S]*?```/g, "")
      .trim();

    return NextResponse.json({
      message: cleanMessage || "Here's your updated flow:",
      flowUpdate,
      saveAsTemplate,
      userNodeDef,
    });
  } catch (err) {
    const rawMessage =
      err instanceof Error ? err.message : "AI request failed";
    const errorMessage = sanitizeErrorMessage(rawMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
