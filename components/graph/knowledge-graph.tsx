"use client";

import * as React from "react";
import cytoscape from "cytoscape";
import { cn } from "@/lib/utils";
import type { GraphNode, GraphEdge, GraphViewMode } from "@/lib/types";

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  layout?: "cose" | "grid" | "circle" | "concentric";
  viewMode?: GraphViewMode;
  highlightPath?: string[];
  className?: string;
}

const NODE_COLORS: Record<string, string> = {
  deal: "#34d399",
  contact: "#60a5fa",
  group: "#a78bfa",
  doc: "#fbbf24",
};

const NODE_SHAPES: Record<string, string> = {
  deal: "round-rectangle",
  contact: "ellipse",
  group: "diamond",
  doc: "round-rectangle",
};

const EDGE_STYLES: Record<string, { lineStyle: string; lineColor: string }> = {
  deal_contact: { lineStyle: "solid", lineColor: "#34d39960" },
  deal_group: { lineStyle: "dashed", lineColor: "#a78bfa60" },
  doc_deal: { lineStyle: "dotted", lineColor: "#fbbf2460" },
  doc_contact: { lineStyle: "dotted", lineColor: "#fbbf2460" },
  doc_group: { lineStyle: "dotted", lineColor: "#fbbf2460" },
  contact_contact: { lineStyle: "solid", lineColor: "#60a5fa40" },
  contact_group: { lineStyle: "dashed", lineColor: "#a78bfa40" },
  participant: { lineStyle: "solid", lineColor: "#60a5fa50" },
};

const ROLE_BORDER_COLORS: Record<string, string> = {
  primary: "#34d399",
  champion: "#60a5fa",
  influencer: "#a78bfa",
  blocker: "#f87171",
  decision_maker: "#fbbf24",
  involved: "#94a3b8",
};

export function KnowledgeGraph({
  nodes,
  edges,
  onNodeClick,
  onNodeDoubleClick,
  onEdgeClick,
  layout = "cose",
  viewMode = "explorer",
  highlightPath,
  className,
}: KnowledgeGraphProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cyRef = React.useRef<cytoscape.Core | null>(null);
  const [tooltip, setTooltip] = React.useState<{ x: number; y: number; node: GraphNode } | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [];

    // Parent (compound) nodes
    const parentIds = new Set<string>();
    for (const n of nodes) {
      if (n.parent && !parentIds.has(n.parent)) {
        parentIds.add(n.parent);
        const existing = nodes.find((nn) => nn.id === n.parent);
        if (existing) elements.push({ data: { id: existing.id, label: existing.label, nodeType: "company_group", isCompanyGroup: true } });
      }
    }

    // Regular nodes
    for (const n of nodes) {
      if (parentIds.has(n.id)) continue;
      const connectionCount = (n.meta.connection_count as number) ?? 0;
      const influenceScore = (n.meta.influence_score as number) ?? 0;
      const role = (n.meta.role as string) ?? "";
      let size = 40;
      if (viewMode === "relationships" && n.type === "contact") size = Math.max(30, Math.min(70, 30 + connectionCount * 4));
      else if (viewMode === "deal-influence") {
        if (n.type === "deal") size = 60;
        else if (n.type === "contact") size = Math.max(25, Math.min(60, 25 + (influenceScore / 100) * 35));
      }
      elements.push({
        data: { id: n.id, label: n.label.length > 20 ? n.label.slice(0, 18) + "..." : n.label, fullLabel: n.label, nodeType: n.type, parent: n.parent, nodeSize: size, role, influenceScore, connectionCount, ...n.meta },
        classes: [n.type, role ? `role-${role}` : "", highlightPath?.includes(n.id) ? "on-path" : "", highlightPath && !highlightPath.includes(n.id) ? "off-path" : ""].filter(Boolean).join(" "),
      });
    }

    // Edges
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const isOnPath = highlightPath && highlightPath.some((id, idx) => idx < highlightPath.length - 1 && ((id === e.source && highlightPath[idx + 1] === e.target) || (id === e.target && highlightPath[idx + 1] === e.source)));
      elements.push({
        data: { id: `e-${i}`, source: e.source, target: e.target, edgeType: e.type, strength: e.strength ?? 0, edgeLabel: e.label ?? "" },
        classes: [isOnPath ? "on-path" : "", highlightPath && !isOnPath ? "off-path" : ""].filter(Boolean).join(" "),
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style: any[] = [
      { selector: "node", style: { label: "data(label)", "text-valign": "center", "text-halign": "center", "font-size": "10px", color: "#e2e8f0", "text-outline-color": "#0f1729", "text-outline-width": 2, width: "data(nodeSize)", height: "data(nodeSize)", "border-width": 2, "border-color": "#ffffff10" } },
      ...Object.entries(NODE_COLORS).map(([type, color]) => ({ selector: `node.${type}`, style: { "background-color": color, shape: NODE_SHAPES[type] as cytoscape.Css.NodeShape, "border-color": `${color}80` } })),
      { selector: "node[?isCompanyGroup]", style: { "background-color": "#ffffff05", "border-color": "#ffffff15", "border-width": 1, label: "data(label)", "text-valign": "top", "font-size": "9px", color: "#ffffff60", shape: "round-rectangle", padding: "15px" } },
      ...Object.entries(ROLE_BORDER_COLORS).map(([role, color]) => ({ selector: `node.role-${role}`, style: { "border-color": color, "border-width": 3 } })),
      { selector: "edge", style: { width: 1.5, "line-color": "#ffffff20", "curve-style": "bezier", opacity: 0.6 } },
      ...Object.entries(EDGE_STYLES).map(([type, s]) => ({ selector: `edge[edgeType = "${type}"]`, style: { "line-style": s.lineStyle as cytoscape.Css.LineStyle, "line-color": s.lineColor } })),
      { selector: "edge[strength > 0]", style: { width: "mapData(strength, 0, 100, 1, 5)", opacity: "mapData(strength, 0, 100, 0.3, 0.8)" } },
      { selector: 'edge[edgeType = "participant"][edgeLabel]', style: { label: "data(edgeLabel)", "font-size": "8px", color: "#ffffff40", "text-rotation": "autorotate" } },
      { selector: "node:active", style: { "overlay-opacity": 0.1 } },
      { selector: "node.dimmed", style: { opacity: 0.15 } },
      { selector: "edge.dimmed", style: { opacity: 0.05 } },
      { selector: "node.highlighted", style: { "border-width": 3, "border-color": "#fff", width: 50, height: 50 } },
      { selector: "node.on-path", style: { "border-width": 3, "border-color": "#fff", "background-opacity": 1, "z-index": 10 } },
      { selector: "node.off-path", style: { opacity: 0.15 } },
      { selector: "edge.on-path", style: { "line-color": "#60a5fa", width: 3, opacity: 1, "z-index": 10 } },
      { selector: "edge.off-path", style: { opacity: 0.05 } },
    ];

    let layoutConfig: cytoscape.LayoutOptions;
    if (viewMode === "deal-influence") {
      layoutConfig = { name: "concentric", concentric: (node: cytoscape.NodeSingular) => { if (node.data("nodeType") === "deal") return 100; return node.data("influenceScore") ?? 0; }, levelWidth: () => 25, animate: false, minNodeSpacing: 40 } as cytoscape.LayoutOptions;
    } else if (layout === "cose") {
      layoutConfig = { name: "cose", idealEdgeLength: () => 120, nodeOverlap: 20, nodeRepulsion: () => 8000, gravity: 0.3, numIter: 500, animate: false } as cytoscape.LayoutOptions;
    } else {
      layoutConfig = { name: layout } as cytoscape.LayoutOptions;
    }

    const cy = cytoscape({ container: containerRef.current, elements, style, layout: layoutConfig, minZoom: 0.2, maxZoom: 3, wheelSensitivity: 0.3 });

    cy.on("tap", "node", (evt) => { const d = evt.target.data(); if (d.isCompanyGroup) return; const n = nodes.find((n) => n.id === d.id); if (n && onNodeClick) onNodeClick(n); });
    cy.on("dbltap", "node", (evt) => { const d = evt.target.data(); if (d.isCompanyGroup) return; const n = nodes.find((n) => n.id === d.id); if (n && onNodeDoubleClick) onNodeDoubleClick(n); });
    cy.on("tap", "edge", (evt) => { const d = evt.target.data(); const e = edges.find((e) => (e.source === d.source && e.target === d.target) || (e.source === d.target && e.target === d.source)); if (e && onEdgeClick) onEdgeClick(e); });
    cy.on("mouseover", "node", (evt) => { const d = evt.target.data(); if (d.isCompanyGroup) return; const n = nodes.find((n) => n.id === d.id); if (n) setTooltip({ x: evt.renderedPosition.x, y: evt.renderedPosition.y, node: n }); if (containerRef.current) containerRef.current.style.cursor = "pointer"; });
    cy.on("mouseout", "node", () => { setTooltip(null); if (containerRef.current) containerRef.current.style.cursor = "default"; });
    cy.on("mouseover", "edge", () => { if (containerRef.current) containerRef.current.style.cursor = "pointer"; });
    cy.on("mouseout", "edge", () => { if (containerRef.current) containerRef.current.style.cursor = "default"; });
    cy.on("pan zoom", () => { setTooltip(null); });

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [nodes, edges, layout, viewMode, highlightPath, onNodeClick, onNodeDoubleClick, onEdgeClick]);

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="w-full h-full" />
      {tooltip ? (
        <div className="absolute z-50 pointer-events-none rounded-xl border border-white/10 bg-[#0f1729]/95 px-3 py-2 text-xs shadow-lg backdrop-blur" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: NODE_COLORS[tooltip.node.type] }} />
            <span className="font-medium text-foreground">{tooltip.node.label}</span>
          </div>
          <span className="text-[10px] text-muted-foreground capitalize">{tooltip.node.type}</span>
          {typeof tooltip.node.meta.value === "number" ? <span className="text-[10px] text-muted-foreground ml-2">{`$${tooltip.node.meta.value.toLocaleString()}`}</span> : null}
          {typeof tooltip.node.meta.company === "string" ? <span className="text-[10px] text-muted-foreground ml-2">{tooltip.node.meta.company}</span> : null}
          {typeof tooltip.node.meta.member_count === "number" ? <span className="text-[10px] text-muted-foreground ml-2">{`${tooltip.node.meta.member_count} members`}</span> : null}
          {viewMode === "relationships" && typeof tooltip.node.meta.connection_count === "number" ? <div className="text-[10px] text-muted-foreground mt-0.5">{`${tooltip.node.meta.connection_count} connections`}</div> : null}
          {viewMode === "deal-influence" && typeof tooltip.node.meta.role === "string" ? <div className="text-[10px] text-muted-foreground mt-0.5">{`${tooltip.node.meta.role} · influence: ${tooltip.node.meta.influence_score}`}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function highlightConnected(cy: cytoscape.Core, nodeId: string) {
  cy.elements().addClass("dimmed");
  const node = cy.getElementById(nodeId);
  const neighborhood = node.neighborhood().add(node);
  neighborhood.removeClass("dimmed");
  node.addClass("highlighted");
}

export function clearHighlights(cy: cytoscape.Core) {
  cy.elements().removeClass("dimmed").removeClass("highlighted");
}
