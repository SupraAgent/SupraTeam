/**
 * Shared helpers for summarizing canvas state into compact,
 * AI-readable text. Used by both BuilderChat and AIFlowChat.
 */

import type { Node, Edge } from "@xyflow/react";
import { getUserNodes } from "./user-nodes";

/** Summarize nodes into a compact, AI-readable format instead of raw JSON */
export function summarizeNodes(nodes: Node[]): string {
  if (nodes.length === 0) return "Canvas is empty.";

  const lines: string[] = [`${nodes.length} nodes on canvas:`];
  for (const node of nodes) {
    const d = node.data as Record<string, unknown>;
    const label = (d.label as string) || node.id;
    switch (node.type) {
      case "personaNode":
        lines.push(`  - [Persona] "${label}" role=${d.role} weight=${d.voteWeight} expertise=[${(d.expertise as string[] ?? []).join(", ")}]`);
        break;
      case "appNode":
        lines.push(`  - [App] "${label}" users="${d.targetUsers}" state=${d.currentState || "unset"} value="${d.coreValue}"`);
        break;
      case "competitorNode":
        lines.push(`  - [Competitor] "${label}" score=${d.overallScore} cpo="${d.cpoName}"`);
        break;
      case "llmNode":
        lines.push(`  - [LLM] "${label}" provider=${d.provider} model=${d.model} temp=${d.temperature}`);
        break;
      case "triggerNode":
        lines.push(`  - [Trigger] "${label}" type=${d.triggerType} config="${d.config}"`);
        break;
      case "conditionNode":
        lines.push(`  - [Condition] "${label}" if="${d.condition}"`);
        break;
      case "transformNode":
        lines.push(`  - [Transform] "${label}" type=${d.transformType} expr="${d.expression}"`);
        break;
      case "outputNode":
        lines.push(`  - [Output] "${label}" type=${d.outputType} dest="${d.destination}"`);
        break;
      case "actionNode":
        lines.push(`  - [Action] "${label}" type=${d.actionType} desc="${d.description}"`);
        break;
      case "noteNode":
        lines.push(`  - [Note] "${label}"`);
        break;
      case "consensusNode":
        lines.push(`  - [Consensus] "${label}" personas=${(d.personas as unknown[] ?? []).length}`);
        break;
      case "affinityCategoryNode":
        lines.push(`  - [Category] "${label}" weight=${d.weight ?? 0} score=${d.score ?? 0}`);
        break;
      case "stepNode":
        lines.push(`  - [Step ${((d.stepIndex as number) ?? 0) + 1}] "${label}" ${d.status ?? "pending"}`);
        break;
      case "configNode":
        lines.push(`  - [Config] "${label}" type=${d.configType ?? "unknown"} path="${d.filePath ?? ""}"`);
        break;
      case "httpNode":
        lines.push(`  - [HTTP] "${label}" method=${d.method ?? "GET"} url="${d.url ?? ""}"`);
        break;
      case "webhookNode":
        lines.push(`  - [Webhook] "${label}" ${d.webhookMethod ?? "POST"} ${d.path ?? ""}`);
        break;
      case "emailNode":
        lines.push(`  - [Email] "${label}" ${d.emailAction ?? "send"} to="${d.to ?? ""}" subject="${d.subject ?? ""}"`);
        break;
      case "databaseNode":
        lines.push(`  - [DB] "${label}" ${d.dbAction ?? "query"} ${d.dbType ?? "postgres"} table="${d.table ?? ""}"`);
        break;
      case "storageNode":
        lines.push(`  - [Storage] "${label}" ${d.storageAction ?? "read"} ${d.provider ?? "local"} path="${d.path ?? ""}"`);
        break;
      case "jsonNode":
        lines.push(`  - [JSON] "${label}" ${d.jsonAction ?? "parse"} expression="${d.expression ?? ""}"`);
        break;
      case "textNode":
        lines.push(`  - [Text] "${label}" ${d.textAction ?? "template"}`);
        break;
      case "aggregatorNode":
        lines.push(`  - [Aggregate] "${label}" ${d.aggregateType ?? "concat"}`);
        break;
      case "validatorNode":
        lines.push(`  - [Validate] "${label}" ${d.validationType ?? "required"} field="${d.field ?? ""}"`);
        break;
      case "formatterNode":
        lines.push(`  - [Format] "${label}" ${d.formatType ?? "markdown"}`);
        break;
      case "loopNode":
        lines.push(`  - [Loop] "${label}" ${d.loopType ?? "forEach"} maxIterations=${d.maxIterations ?? 100}`);
        break;
      case "switchNode":
        lines.push(`  - [Switch] "${label}" ${d.matchType ?? "exact"} field="${d.field ?? ""}"`);
        break;
      case "delayNode":
        lines.push(`  - [Delay] "${label}" ${d.delayType ?? "fixed"} ${d.duration ?? 1000}ms`);
        break;
      case "errorHandlerNode":
        lines.push(`  - [ErrorHandler] "${label}" ${d.errorAction ?? "catch"} maxRetries=${d.maxRetries ?? 3}`);
        break;
      case "mergeNode":
        lines.push(`  - [Merge] "${label}" ${d.mergeStrategy ?? "waitAll"} outputFormat=${d.outputFormat ?? "object"}`);
        break;
      case "classifierNode":
        lines.push(`  - [Classify] "${label}" ${d.classifyType ?? "sentiment"} confidence=${d.confidence ?? 0.7}`);
        break;
      case "summarizerNode":
        lines.push(`  - [Summarize] "${label}" ${d.summaryStyle ?? "bullets"} maxLength=${d.maxLength ?? 200}`);
        break;
      case "searchNode":
        lines.push(`  - [Search] "${label}" ${d.searchProvider ?? "brave"} query="${d.query ?? ""}" maxResults=${d.maxResults ?? 5}`);
        break;
      case "embeddingNode":
        lines.push(`  - [Embed] "${label}" ${d.embeddingAction ?? "embed"} ${d.provider ?? "openai"} model="${d.model ?? ""}"`);
        break;
      case "extractorNode":
        lines.push(`  - [Extract] "${label}" ${d.extractType ?? "entities"} outputFormat=${d.outputFormat ?? "json"}`);
        break;
      default: {
        const userNodeId = d._userNodeId;
        if (userNodeId) {
          lines.push(`  - [UserNode:${userNodeId}] "${label}"`);
        } else {
          lines.push(`  - [${node.type}] "${label}"`);
        }
      }
    }
  }
  return lines.join("\n");
}

/** Summarize edges into a compact, AI-readable format */
export function summarizeEdges(edges: Edge[], nodes: Node[]): string {
  if (edges.length === 0) return "No connections.";
  const nodeLabels = new Map(nodes.map((n) => [n.id, (n.data as { label?: string }).label || n.id]));
  const lines = edges.map((e) => {
    const from = nodeLabels.get(e.source) ?? e.source;
    const to = nodeLabels.get(e.target) ?? e.target;
    const handle = e.sourceHandle ? ` [${e.sourceHandle}]` : "";
    return `  ${from}${handle} → ${to}`;
  });
  return `${edges.length} connections:\n${lines.join("\n")}`;
}

/** Summarize user-created custom node definitions */
export function summarizeUserNodes(): string {
  const defs = getUserNodes();
  if (defs.length === 0) return "";
  return `\n\nUser's custom nodes (${defs.length}):\n${defs.map((d) => `  - ${d.emoji} "${d.label}" (${d.nodeType}) — ${d.description || "no description"}, fields: [${d.fields.map(f => f.key).join(", ")}]`).join("\n")}`;
}

/** Build a full canvas summary string for AI context */
export function buildCanvasSummary(nodes: Node[], edges: Edge[], includeUserNodes = false): string {
  let summary = summarizeNodes(nodes) + "\n\n" + summarizeEdges(edges, nodes);
  if (includeUserNodes) {
    summary += summarizeUserNodes();
  }
  return summary;
}
