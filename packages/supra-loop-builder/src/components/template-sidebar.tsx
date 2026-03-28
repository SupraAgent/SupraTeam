"use client";

import * as React from "react";
import type { Node, Edge } from "@xyflow/react";
import type { FlowTemplate } from "../lib/flow-templates";
import {
  BUILT_IN_TEMPLATES,
  getCustomTemplates,
  deleteCustomTemplate,
  copyTemplate,
  saveCustomTemplate,
  getStarredTemplateIds,
  toggleStarTemplate,
} from "../lib/flow-templates";
import {
  getBuilderTemplates,
  deleteBuilderTemplate,
  builderTemplateToFlowNodes,
  computeNextOffsetY,
  SOURCE_META,
  type BuilderTemplate,
} from "../lib/builder-templates";

import { GROUP_COLORS, groupColorIndex } from "./flow-canvas";
import { uid } from "../lib/utils";

type Tab = "templates" | "my-templates" | "groups";

/** Unified item displayed in the "My Templates" tab */
type MyTemplateItem = {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  source: "flow" | "persona-studio" | "launch-kit" | "design-to-ship";
  /** For flow custom templates, the original FlowTemplate */
  flowTemplate?: FlowTemplate;
  /** For builder templates, the original BuilderTemplate */
  builderTemplate?: BuilderTemplate;
};

type TemplateSidebarProps = {
  /** Called to replace canvas (used for built-in template clicks) */
  onSelect: (template: FlowTemplate) => void;
  /** Called to merge nodes into existing canvas (used for My Templates) */
  onMerge?: (nodes: Node[], edges: Edge[]) => void;
  /** Current canvas nodes — needed for offset calculation and save */
  canvasNodes?: Node[];
  /** Current canvas edges — needed for save */
  canvasEdges?: Edge[];
  /** Active locked groups on canvas */
  lockedGroups?: Map<string, Set<string>>;
  /** Select all nodes in a group */
  onSelectGroup?: (groupId: string) => void;
  /** Unlock a group */
  onUnlockGroup?: (nodeIds: string[]) => void;
  onClose: () => void;
  /** Callback to start the Bridge Walkthrough Tour */
  onStartBridgeTour?: () => void;
};

export function TemplateSidebar({
  onSelect,
  onMerge,
  canvasNodes = [],
  canvasEdges = [],
  lockedGroups,
  onSelectGroup,
  onUnlockGroup,
  onClose,
  onStartBridgeTour,
}: TemplateSidebarProps) {
  const [tab, setTab] = React.useState<Tab>("templates");
  const [starred, setStarred] = React.useState<Set<string>>(new Set());
  const [customFlowTemplates, setCustomFlowTemplates] = React.useState<FlowTemplate[]>([]);
  const [builderTemplates, setBuilderTemplates] = React.useState<BuilderTemplate[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [saveFlash, setSaveFlash] = React.useState(false);

  const refresh = React.useCallback(() => {
    setStarred(getStarredTemplateIds());
    setCustomFlowTemplates(getCustomTemplates());
    setBuilderTemplates(getBuilderTemplates());
  }, []);

  // Refresh on mount AND when sidebar regains focus / visibility
  React.useEffect(() => {
    refresh();
    function onFocus() { refresh(); }
    function onVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Build unified "My Templates" list
  const myTemplateItems = React.useMemo<MyTemplateItem[]>(() => {
    const items: MyTemplateItem[] = [];
    for (const ft of customFlowTemplates) {
      items.push({
        id: ft.id,
        name: ft.name,
        description: ft.description,
        nodeCount: ft.nodes.length,
        edgeCount: ft.edges.length,
        source: "flow",
        flowTemplate: ft,
      });
    }
    for (const bt of builderTemplates) {
      const { nodes, edges } = builderTemplateToFlowNodes(bt, 0);
      items.push({
        id: bt.id,
        name: bt.name,
        description: bt.description,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        source: bt.source,
        builderTemplate: bt,
      });
    }
    return items;
  }, [customFlowTemplates, builderTemplates]);

  const handleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    toggleStarTemplate(id);
    setStarred(getStarredTemplateIds());
  };

  const handleDeleteMyTemplate = (e: React.MouseEvent, item: MyTemplateItem) => {
    e.stopPropagation();
    if (confirmDeleteId !== item.id) {
      setConfirmDeleteId(item.id);
      return;
    }
    if (item.source === "flow") {
      deleteCustomTemplate(item.id);
    } else {
      deleteBuilderTemplate(item.id);
    }
    setConfirmDeleteId(null);
    refresh();
  };

  const handleDeleteBuiltInCopy = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    deleteCustomTemplate(id);
    setConfirmDeleteId(null);
    refresh();
  };

  /** Click on a built-in template → replace canvas (with confirmation in flow-canvas) */
  const handleUseBuiltIn = (template: FlowTemplate) => {
    if (template.isBuiltIn) {
      const copy = copyTemplate(template);
      refresh();
      onSelect(copy);
    } else {
      onSelect({
        ...template,
        nodes: JSON.parse(JSON.stringify(template.nodes)),
        edges: JSON.parse(JSON.stringify(template.edges)),
      });
    }
  };

  /** Click on a My Template item → merge into canvas */
  const handleUseMyTemplate = (item: MyTemplateItem) => {
    if (!onMerge) return;
    if (item.source === "flow" && item.flowTemplate) {
      const t = item.flowTemplate;
      const offsetY = computeNextOffsetY(canvasNodes);
      const suffix = uid("merge");
      const idMap: Record<string, string> = {};
      const newNodes = t.nodes.map((n) => {
        const newId = `${n.type}-${suffix}-${n.id}`;
        idMap[n.id] = newId;
        return {
          ...n,
          id: newId,
          position: { x: n.position.x, y: n.position.y + offsetY },
          data: JSON.parse(JSON.stringify(n.data)),
        };
      });
      const newEdges = t.edges.map((edge, i) => ({
        ...edge,
        id: `e-merge-${suffix}-${i}`,
        source: idMap[edge.source] ?? edge.source,
        target: idMap[edge.target] ?? edge.target,
      }));
      onMerge(newNodes, newEdges);
    } else if (item.builderTemplate) {
      const offsetY = computeNextOffsetY(canvasNodes);
      const { nodes, edges } = builderTemplateToFlowNodes(item.builderTemplate, offsetY);
      onMerge(nodes, edges);
    }
  };

  /** Save current canvas as a reusable custom flow template */
  const handleSaveCanvasAsTemplate = () => {
    if (canvasNodes.length === 0) return;
    const name = `Canvas ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    const template: FlowTemplate = {
      id: uid("custom"),
      name,
      description: `${canvasNodes.length} nodes, ${canvasEdges.length} edges`,
      category: "custom",
      nodes: JSON.parse(JSON.stringify(canvasNodes)),
      edges: JSON.parse(JSON.stringify(canvasEdges)),
      createdAt: new Date().toISOString().split("T")[0],
      isBuiltIn: false,
    };
    saveCustomTemplate(template);
    refresh();
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
  };

  const handleDragStartBuiltIn = (e: React.DragEvent, template: FlowTemplate) => {
    e.dataTransfer.setData("application/reactflow-template", JSON.stringify(template));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragStartMyTemplate = (e: React.DragEvent, item: MyTemplateItem) => {
    if (item.source === "flow" && item.flowTemplate) {
      e.dataTransfer.setData("application/reactflow-template", JSON.stringify(item.flowTemplate));
    } else if (item.builderTemplate) {
      e.dataTransfer.setData("application/builder-template", JSON.stringify(item.builderTemplate));
    }
    e.dataTransfer.effectAllowed = "copy";
  };

  // Filter templates based on search
  const filterBySearch = <T extends { name: string; description: string }>(items: T[]): T[] => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  };

  // Sort starred to top
  const sortStarredFirst = (templates: FlowTemplate[]) => {
    return [...templates].sort((a, b) => {
      const aStarred = starred.has(a.id) ? 0 : 1;
      const bStarred = starred.has(b.id) ? 0 : 1;
      return aStarred - bStarred;
    });
  };

  const builtInFiltered = sortStarredFirst(filterBySearch(BUILT_IN_TEMPLATES));
  const myTemplatesFiltered = filterBySearch(myTemplateItems);

  // Group built-in templates by category
  const groupedBuiltIn = builtInFiltered.reduce<Record<string, FlowTemplate[]>>(
    (acc, t) => {
      (acc[t.category] ??= []).push(t);
      return acc;
    },
    {}
  );

  const categoryLabels: Record<string, string> = {
    team: "Team",
    app: "App",
    benchmark: "Benchmark",
    scoring: "Scoring",
    improve: "Improve",
    workflow: "Workflow",
  };

  const sourceLabels: Record<string, { label: string; color: string }> = {
    flow: { label: "Canvas", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    "persona-studio": { label: SOURCE_META["persona-studio"].icon + " Persona", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
    "launch-kit": { label: SOURCE_META["launch-kit"].icon + " Launch", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
    "design-to-ship": { label: SOURCE_META["design-to-ship"].icon + " Design", color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  };

  return (
    <div className="flex h-full w-full sm:w-72 flex-col border-l border-white/10 bg-background fixed inset-0 sm:static sm:inset-auto z-50 sm:z-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">Templates</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition text-sm"
          aria-label="Close templates"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setTab("templates")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition ${
            tab === "templates"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => setTab("my-templates")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition ${
            tab === "my-templates"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          My Templates
          {myTemplateItems.length > 0 && (
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({myTemplateItems.length})
            </span>
          )}
        </button>
        {lockedGroups && lockedGroups.size > 0 && (
          <button
            onClick={() => setTab("groups")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition ${
              tab === "groups"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Groups
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({lockedGroups.size})
            </span>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="border-b border-white/10 px-3 py-2">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            aria-label="Search templates"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/30 focus:outline-none transition"
          />
        </div>
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {tab === "templates" && (
          builtInFiltered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No templates match your search.
            </div>
          ) : (
            <>
            {/* Featured Template Spotlight — Bridge */}
            {!searchQuery && (
              <FeaturedBridgeSpotlight
                onUse={() => {
                  const bridge = BUILT_IN_TEMPLATES.find((t) => t.id === "workflow-bridge");
                  if (bridge) handleUseBuiltIn(bridge);
                }}
                onGuideMe={onStartBridgeTour
                  ? () => {
                      // Signal the tour should start, then load template.
                      // The canvas will start the tour after the template is actually applied
                      // (which may require a confirmation dialog first).
                      onStartBridgeTour();
                      const bridge = BUILT_IN_TEMPLATES.find((t) => t.id === "workflow-bridge");
                      if (bridge) handleUseBuiltIn(bridge);
                    }
                  : undefined
                }
              />
            )}
            {Object.entries(groupedBuiltIn).map(([category, templates]) => (
              <div key={category} className="mb-3">
                <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {categoryLabels[category] ?? category}
                </div>
                <div className="space-y-1">
                  {templates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      name={template.name}
                      description={template.description}
                      nodeCount={template.nodes.length}
                      edgeCount={template.edges.length}
                      isStarred={starred.has(template.id)}
                      isBuiltIn={template.isBuiltIn}
                      onStar={(e) => handleStar(e, template.id)}
                      onUse={() => handleUseBuiltIn(template)}
                      onDragStart={(e) => handleDragStartBuiltIn(e, template)}
                    />
                  ))}
                </div>
              </div>
            ))}
            </>
          )
        )}

        {tab === "my-templates" && (
          myTemplatesFiltered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {searchQuery
                ? "No templates match your search."
                : "No custom templates yet. Save your current canvas or create templates from the builders."}
            </div>
          ) : (
            <div className="space-y-1">
              {myTemplatesFiltered.map((item) => {
                const sl = sourceLabels[item.source];
                return (
                  <TemplateCard
                    key={item.id}
                    name={item.name}
                    description={item.description}
                    nodeCount={item.nodeCount}
                    edgeCount={item.edgeCount}
                    isStarred={starred.has(item.id)}
                    sourceBadge={sl ? { label: sl.label, color: sl.color } : undefined}
                    onStar={(e) => handleStar(e, item.id)}
                    onUse={() => handleUseMyTemplate(item)}
                    onDragStart={(e) => handleDragStartMyTemplate(e, item)}
                    onDelete={(e) => handleDeleteMyTemplate(e, item)}
                    isConfirmingDelete={confirmDeleteId === item.id}
                  />
                );
              })}
            </div>
          )
        )}

        {tab === "groups" && lockedGroups && (
          <div className="space-y-2">
            <p className="px-1 text-[10px] text-muted-foreground leading-relaxed">
              Click a group to select all its nodes on the canvas. Groups are color-coded to help identify boundaries.
            </p>
            {[...lockedGroups.entries()].map(([groupId, memberIds]) => {
              const color = GROUP_COLORS[groupColorIndex(groupId)];
              const members = canvasNodes.filter((n) => memberIds.has(n.id));
              if (members.length === 0) return null;
              const firstLabel = (members[0].data?.label as string) || members[0].type || "Group";
              const types = [...new Set(members.map((n) => n.type).filter(Boolean))];

              return (
                <div
                  key={groupId}
                  className="group rounded-lg border p-3 cursor-pointer transition hover:brightness-110"
                  style={{
                    backgroundColor: color.bg,
                    borderColor: color.border,
                  }}
                  onClick={() => onSelectGroup?.(groupId)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color.text }}
                        />
                        <span className="text-xs font-semibold truncate" style={{ color: color.text }}>
                          {firstLabel}
                          {members.length > 1 && ` +${members.length - 1}`}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{members.length} nodes</span>
                        {types.length > 0 && (
                          <span className="truncate">{types.join(", ")}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnlockGroup?.([...memberIds]);
                      }}
                      className="rounded-md px-2 py-0.5 text-[10px] font-medium transition opacity-0 group-hover:opacity-100"
                      style={{ backgroundColor: color.border, color: "#fff" }}
                    >
                      Unlock
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save Canvas as Template button (My Templates tab only) */}
      {tab === "my-templates" && (
        <div className="border-t border-white/10 px-3 py-3">
          <button
            onClick={handleSaveCanvasAsTemplate}
            disabled={canvasNodes.length === 0}
            className={`w-full rounded-lg px-3 py-2 text-xs font-medium transition ${
              saveFlash
                ? "bg-primary/15 text-primary border border-primary/30"
                : "bg-white/5 text-foreground border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
          >
            {saveFlash ? "Saved!" : "Save Current Canvas as Template"}
          </button>
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  name,
  description,
  nodeCount,
  edgeCount,
  isStarred,
  isBuiltIn,
  sourceBadge,
  onStar,
  onUse,
  onDragStart,
  onDelete,
  isConfirmingDelete,
}: {
  name: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  isStarred: boolean;
  isBuiltIn?: boolean;
  sourceBadge?: { label: string; color: string };
  onStar: (e: React.MouseEvent) => void;
  onUse: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  isConfirmingDelete?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onUse}
      className="group cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] p-3 hover:bg-white/5 hover:border-white/20 transition"
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition">
            {name}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onStar}
            className={`p-0.5 transition ${
              isStarred
                ? "text-yellow-400"
                : "text-muted-foreground/30 group-hover:text-muted-foreground/60 hover:text-yellow-400"
            }`}
            title={isStarred ? "Unstar" : "Star to pin to top"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className={`p-0.5 transition ${
                isConfirmingDelete
                  ? "text-red-400 opacity-100"
                  : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-red-400"
              }`}
              title={isConfirmingDelete ? "Click again to confirm delete" : "Delete template"}
            >
              {isConfirmingDelete ? (
                <span className="text-[10px] font-medium">Confirm?</span>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{nodeCount} nodes</span>
        <span>{edgeCount} edges</span>
        {isBuiltIn && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary text-[9px]">
            Built-in
          </span>
        )}
        {sourceBadge && (
          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${sourceBadge.color}`}>
            {sourceBadge.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Featured Bridge Spotlight ────────────────────────────────────

function FeaturedBridgeSpotlight({
  onUse,
  onGuideMe,
}: {
  onUse: () => void;
  onGuideMe?: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent p-4">
      {/* Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Featured
        </span>
      </div>

      {/* Title & description */}
      <h4 className="text-xs font-bold text-foreground mb-1">
        Gap-to-Improvement Bridge
      </h4>
      <p className="text-[10px] text-muted-foreground leading-relaxed mb-3">
        The core improvement workflow. Identifies your weakest categories, generates AI fixes, gets feedback, and re-scores — all in one run.
      </p>

      {/* Flow preview: mini node diagram */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
        {[
          { label: "Trigger", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
          { label: "LLM x3", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
          { label: "Merge", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
          { label: "CPO", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
          { label: "Re-Score", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
          { label: "Output", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
        ].map((node, i, arr) => (
          <React.Fragment key={node.label}>
            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-medium ${node.color}`}>
              {node.label}
            </span>
            {i < arr.length - 1 && (
              <svg className="shrink-0 text-white/20" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onUse}
          className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition"
        >
          Load Template
        </button>
        {onGuideMe && (
          <button
            onClick={onGuideMe}
            className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition"
          >
            Guide Me
          </button>
        )}
      </div>
    </div>
  );
}
