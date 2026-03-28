// ── Builder Templates ────────────────────────────────────────────
// Templates created from builder forms (Persona Studio, Launch Kit, Design-to-Ship)
// Stored in localStorage, loadable into the Workflow Builder canvas.

import type { Node, Edge } from "@xyflow/react";
import { uid } from "./utils";
import { syncStorage } from "./storage-context";

export type BuilderTemplateSource =
  | "persona-studio"
  | "launch-kit"
  | "design-to-ship";

// ── Typed metadata per source ────────────────────────────────────

export type PersonaStudioMeta = {
  projectName: string;
  description: string;
  targetUser: string;
  problem: string;
  personas: Array<{
    role: string;
    company?: string;
    focus?: string;
    emoji?: string;
  }>;
  consensusThreshold: number;
};

export type LaunchKitMeta = {
  projectName: string;
  description: string;
  targetUser: string;
  problem: string;
  team: Array<{
    role: string;
    company?: string;
    focus?: string;
  }>;
  techChoices: Array<{
    category: string;
    choice: string;
  }>;
  projectType: string | null;
};

export type DesignToShipMeta = {
  projectName: string;
  atmosphere: string | null;
  screens: Array<{
    name: string;
    description?: string;
  }>;
  personas: Array<{
    role: string;
    company?: string;
    focus?: string;
  }>;
};

export type BuilderTemplateMetadata =
  | { source: "persona-studio"; data: PersonaStudioMeta }
  | { source: "launch-kit"; data: LaunchKitMeta }
  | { source: "design-to-ship"; data: DesignToShipMeta };

export type BuilderTemplate = {
  id: string;
  name: string;
  description: string;
  source: BuilderTemplateSource;
  content: string;
  metadata: BuilderTemplateMetadata;
  createdAt: string;
};

let STORAGE_KEY = "athena:builder-templates";

export function setBuilderTemplateStorageKey(key: string) {
  STORAGE_KEY = key;
}

// ── CRUD ─────────────────────────────────────────────────────────

export function getBuilderTemplates(): BuilderTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = syncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getBuilderTemplatesBySource(
  source: BuilderTemplateSource
): BuilderTemplate[] {
  return getBuilderTemplates().filter((t) => t.source === source);
}

export function saveBuilderTemplate(template: BuilderTemplate): void {
  const existing = getBuilderTemplates();
  // Deduplicate by name + source — updating an existing template replaces it
  const idx = existing.findIndex(
    (t) => t.name === template.name && t.source === template.source
  );
  if (idx >= 0) {
    existing[idx] = { ...template, id: existing[idx].id };
  } else {
    existing.push(template);
  }
  syncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function deleteBuilderTemplate(id: string): void {
  const existing = getBuilderTemplates().filter((t) => t.id !== id);
  syncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function renameBuilderTemplate(id: string, name: string): void {
  const existing = getBuilderTemplates();
  const idx = existing.findIndex((t) => t.id === id);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], name };
    syncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  }
}

// ── Convert builder template → flow nodes ────────────────────────

/**
 * Compute the center position of a set of generated nodes,
 * used to re-center when dropping onto the canvas.
 */
export function getNodesCenter(nodes: Node[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  for (const n of nodes) {
    sumX += n.position.x;
    sumY += n.position.y;
  }
  return { x: sumX / nodes.length, y: sumY / nodes.length };
}

/**
 * Convert a builder template into flow nodes + edges that can be
 * merged into the Workflow Builder canvas.
 *
 * offsetY is the starting Y position so multiple templates don't overlap.
 */
export function builderTemplateToFlowNodes(
  template: BuilderTemplate,
  offsetY = 0
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const meta = template.metadata;

  switch (meta.source) {
    case "persona-studio": {
      const { personas } = meta.data;
      const cx = 400;
      const cy = 250 + offsetY;

      // Hub node
      const hubId = `hub-${uid()}`;
      nodes.push({
        id: hubId,
        type: "appNode",
        position: { x: cx, y: cy },
        data: {
          label: template.name,
          description: template.description,
          targetUsers: "",
          coreValue: "",
          currentState: "",
        },
      });

      // Persona nodes in a ring
      const count = personas.length || 1;
      const rx = 350;
      const ry = 220;
      personas.forEach((p, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const pid = `persona-${uid()}-${i}`;
        nodes.push({
          id: pid,
          type: "personaNode",
          position: {
            x: cx + Math.cos(angle) * rx,
            y: cy + Math.sin(angle) * ry,
          },
          data: {
            label: p.role,
            role: p.role,
            voteWeight: 1.0,
            expertise: p.focus ? [p.focus] : [],
            personality: p.company ? `Modeled after ${p.company}` : "",
            emoji: p.emoji ?? "\uD83E\uDD16",
          },
        });
        edges.push({
          id: `e-${pid}-${hubId}`,
          source: pid,
          target: hubId,
          type: "smoothstep",
          animated: true,
        });
      });
      break;
    }

    case "launch-kit": {
      const { team, techChoices } = meta.data;
      const projectName = meta.data.projectName || template.name;

      // App node
      const appId = `app-${uid()}`;
      nodes.push({
        id: appId,
        type: "appNode",
        position: { x: 400, y: 200 + offsetY },
        data: {
          label: projectName,
          description: template.description,
          targetUsers: meta.data.targetUser ?? "",
          coreValue: techChoices.map((t) => t.choice).join(", "),
          currentState: "",
        },
      });

      // Team persona nodes in a grid
      team.forEach((t, i) => {
        const pid = `persona-${uid()}-${i}`;
        nodes.push({
          id: pid,
          type: "personaNode",
          position: {
            x: 50 + (i % 3) * 350,
            y: 450 + offsetY + Math.floor(i / 3) * 200,
          },
          data: {
            label: t.role,
            role: t.role,
            voteWeight: 1.0,
            expertise: t.focus ? [t.focus] : [],
            personality: t.company ? `Modeled after ${t.company}` : "",
            emoji: "\uD83E\uDD16",
          },
        });
        edges.push({
          id: `e-${pid}-${appId}`,
          source: pid,
          target: appId,
          type: "smoothstep",
          animated: true,
        });
      });
      break;
    }

    case "design-to-ship": {
      const { screens } = meta.data;

      // Note node with full content (no truncation)
      const noteId = `note-${uid()}`;
      nodes.push({
        id: noteId,
        type: "noteNode",
        position: { x: 100, y: 100 + offsetY },
        data: {
          label: template.name,
          content: template.content,
        },
      });

      // Action nodes for each screen
      screens.forEach((screen, i) => {
        const sid = `action-${uid()}-${i}`;
        nodes.push({
          id: sid,
          type: "actionNode",
          position: { x: 500, y: 100 + offsetY + i * 120 },
          data: {
            label: screen.name,
            actionType: "generate",
            description: screen.description ?? "",
          },
        });
        edges.push({
          id: `e-${noteId}-${sid}`,
          source: noteId,
          target: sid,
          type: "smoothstep",
          animated: true,
        });
      });
      break;
    }
  }

  return { nodes, edges };
}

/**
 * Compute the Y offset needed to place new nodes below existing canvas nodes.
 * Uses actual bounding box calculation instead of naive node count * constant.
 */
/** Estimated node heights by type, matching auto-layout.ts */
const NODE_HEIGHTS: Record<string, number> = {
  personaNode: 200, appNode: 130, competitorNode: 150, actionNode: 170,
  noteNode: 200, llmNode: 220, stepNode: 200, consensusNode: 220,
  configNode: 160,
};
const DEFAULT_NODE_HEIGHT = 130;

export function computeNextOffsetY(existingNodes: Node[]): number {
  if (existingNodes.length === 0) return 0;
  let maxBottom = -Infinity;
  for (const n of existingNodes) {
    const h = NODE_HEIGHTS[n.type ?? ""] ?? DEFAULT_NODE_HEIGHT;
    maxBottom = Math.max(maxBottom, n.position.y + h);
  }
  // Place below the lowest node bottom edge + padding
  return maxBottom + 80;
}

// ── Source labels / icons ─────────────────────────────────────────

export const SOURCE_META: Record<
  BuilderTemplateSource,
  { label: string; icon: string }
> = {
  "persona-studio": { label: "Persona Studio", icon: "\uD83C\uDFAD" },
  "launch-kit": { label: "Launch Kit", icon: "\uD83D\uDE80" },
  "design-to-ship": { label: "Design-to-Ship", icon: "\uD83C\uDFA8" },
};
