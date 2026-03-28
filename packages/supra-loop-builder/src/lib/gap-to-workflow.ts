/**
 * Gap-to-Workflow Generator — Sprint 2: The Bridge
 *
 * Takes gap analysis data from the improvement loop and generates
 * a pre-built workflow that addresses the top gaps using CPO Review
 * and Re-Score nodes connected to LLM + Transform nodes.
 */

import type { Node, Edge } from "@xyflow/react";
import { uid } from "./utils";

export type GapInput = {
  category: string;
  yourScore: number;
  bestRef: number;
  gap: number;
  priority: "CRITICAL" | "HIGH" | "MED" | "LOW";
};

export type CpoInput = {
  name: string;
  company: string;
  philosophy: string;
  strengths: string[];
};

export type GapWorkflowOptions = {
  gaps: GapInput[];
  cpos: CpoInput[];
  appName: string;
  /** Max gaps to include (default: 3, top by priority) */
  maxGaps?: number;
};

/**
 * Generate a workflow that addresses the top gaps from the improvement loop.
 *
 * Layout:
 *   Trigger → LLM(improve gap) → CPO Review → Re-Score → Output
 *
 * One lane per gap, all fed into a single CPO Review + Re-Score at the end.
 */
export function generateGapWorkflow(opts: GapWorkflowOptions): {
  nodes: Node[];
  edges: Edge[];
} {
  const { gaps, cpos, appName, maxGaps = 3 } = opts;

  // Take top N gaps by priority first, then by gap magnitude
  const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MED: 2, LOW: 3 };
  const topGaps = [...gaps]
    .sort((a, b) => (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || (b.gap - a.gap))
    .slice(0, maxGaps);

  if (topGaps.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const COL_WIDTH = 300;
  const ROW_HEIGHT = 160;

  // ── Column 0: Trigger node
  const triggerId = uid("trigger");
  nodes.push({
    id: triggerId,
    type: "triggerNode",
    position: { x: 0, y: (topGaps.length * ROW_HEIGHT) / 2 - ROW_HEIGHT / 2 },
    data: {
      label: "Start Improvement",
      triggerType: "manual",
      config: "",
    },
  });

  // ── Column 1: One LLM node per gap
  const llmIds: string[] = [];
  for (let i = 0; i < topGaps.length; i++) {
    const gap = topGaps[i];
    const llmId = uid("llm");
    llmIds.push(llmId);

    nodes.push({
      id: llmId,
      type: "llmNode",
      position: { x: COL_WIDTH, y: i * ROW_HEIGHT },
      data: {
        label: `Fix: ${gap.category}`,
        provider: "claude",
        model: "claude-sonnet-4-5-20250514",
        systemPrompt: `You are an expert product improvement consultant. Generate a specific, actionable improvement plan for "${appName}" to close the gap in "${gap.category}".\n\nCurrent score: ${gap.yourScore}/100\nBest competitor: ${gap.bestRef}/100\nGap: ${gap.gap} points (${gap.priority} priority)\n\nProvide:\n1. The single highest-impact change\n2. Implementation steps (3-5 bullets)\n3. Expected score improvement\n4. Acceptance criteria`,
        temperature: 0.7,
        maxTokens: 1024,
      },
    });

    edges.push({
      id: uid("edge"),
      source: triggerId,
      target: llmId,
    });
  }

  // ── Column 2: Merge node (if multiple gaps)
  let mergeOutputId: string;

  if (llmIds.length > 1) {
    const mergeId = uid("merge");
    mergeOutputId = mergeId;
    nodes.push({
      id: mergeId,
      type: "mergeNode",
      position: { x: COL_WIDTH * 2, y: (topGaps.length * ROW_HEIGHT) / 2 - ROW_HEIGHT / 2 },
      data: {
        label: "Merge Improvements",
        mergeStrategy: "concat",
        separator: "\n\n---\n\n",
      },
    });

    for (const llmId of llmIds) {
      edges.push({
        id: uid("edge"),
        source: llmId,
        target: mergeId,
      });
    }
  } else {
    mergeOutputId = llmIds[0];
  }

  // ── Column 3: CPO Review node
  const cpoId = uid("cpoReview");
  const cpoCol = llmIds.length > 1 ? 3 : 2;
  nodes.push({
    id: cpoId,
    type: "cpoReviewNode",
    position: { x: COL_WIDTH * cpoCol, y: (topGaps.length * ROW_HEIGHT) / 2 - ROW_HEIGHT / 2 },
    data: {
      label: "CPO Review",
      description: `${cpos.length} competitor CPOs review your improvements`,
      personas: cpos.map((c) => ({
        name: c.name,
        company: c.company,
        philosophy: c.philosophy,
        strengths: c.strengths,
      })),
      reviewMode: "consensus",
      systemPromptPrefix: `You are {{persona.name}}, CPO at {{persona.company}}. Your product philosophy: "{{persona.philosophy}}". Your strengths: {{persona.strengths}}.\n\nReview the following improvement plan for "${appName}" and provide:\n1. Score (0-100) for how effective this improvement would be\n2. What you'd do differently at ${appName}\n3. Whether this threatens your competitive position`,
    },
  });

  edges.push({
    id: uid("edge"),
    source: mergeOutputId,
    target: cpoId,
  });

  // ── Column 4: Re-Score node
  const rescoreId = uid("rescore");
  const rescoreCol = cpoCol + 1;
  nodes.push({
    id: rescoreId,
    type: "rescoreNode",
    position: { x: COL_WIDTH * rescoreCol, y: (topGaps.length * ROW_HEIGHT) / 2 - ROW_HEIGHT / 2 },
    data: {
      label: "Re-Score",
      categories: topGaps.map((g) => g.category),
      showDelta: true,
      beforeScores: Object.fromEntries(topGaps.map((g) => [g.category, g.yourScore])),
    },
  });

  edges.push({
    id: uid("edge"),
    source: cpoId,
    target: rescoreId,
  });

  // ── Column 5: Output node
  const outputId = uid("output");
  const outputCol = rescoreCol + 1;
  nodes.push({
    id: outputId,
    type: "outputNode",
    position: { x: COL_WIDTH * outputCol, y: (topGaps.length * ROW_HEIGHT) / 2 - ROW_HEIGHT / 2 },
    data: {
      label: "Improvement Report",
      outputType: "log",
      destination: "",
    },
  });

  edges.push({
    id: uid("edge"),
    source: rescoreId,
    target: outputId,
  });

  return { nodes, edges };
}
