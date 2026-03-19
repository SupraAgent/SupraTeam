"use client";

import * as React from "react";
import cytoscape from "cytoscape";
import { cn } from "@/lib/utils";

type GraphNode = {
  id: string;
  type: "deal" | "contact" | "group" | "doc";
  label: string;
  meta: Record<string, unknown>;
};

type GraphEdge = {
  source: string;
  target: string;
  type: string;
};

type KnowledgeGraphProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  layout?: "cose" | "grid" | "circle" | "concentric";
  className?: string;
};

const NODE_COLORS: Record<string, string> = {
  deal: "#34d399",     // primary teal
  contact: "#60a5fa",  // blue
  group: "#a78bfa",    // purple
  doc: "#fbbf24",      // amber
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
};

export function KnowledgeGraph({
  nodes,
  edges,
  onNodeClick,
  onNodeDoubleClick,
  layout = "cose",
  className,
}: KnowledgeGraphProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cyRef = React.useRef<cytoscape.Core | null>(null);
  const [tooltip, setTooltip] = React.useState<{
    x: number;
    y: number;
    node: GraphNode;
  } | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [
      ...nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label.length > 20 ? n.label.slice(0, 18) + "..." : n.label,
          fullLabel: n.label,
          nodeType: n.type,
          ...n.meta,
        },
        classes: n.type,
      })),
      ...edges.map((e, i) => ({
        data: {
          id: `e-${i}`,
          source: e.source,
          target: e.target,
          edgeType: e.type,
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": "10px",
            color: "#e2e8f0",
            "text-outline-color": "#0f1729",
            "text-outline-width": 2,
            width: 40,
            height: 40,
            "border-width": 2,
            "border-color": "#ffffff10",
          },
        },
        // Type-specific styles
        ...Object.entries(NODE_COLORS).map(([type, color]) => ({
          selector: `node.${type}`,
          style: {
            "background-color": color,
            shape: NODE_SHAPES[type] as cytoscape.Css.NodeShape,
            "border-color": `${color}80`,
          },
        })),
        // Edges
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#ffffff20",
            "curve-style": "bezier",
            opacity: 0.6,
          },
        },
        // Edge type styles
        ...Object.entries(EDGE_STYLES).map(([type, s]) => ({
          selector: `edge[edgeType = "${type}"]`,
          style: {
            "line-style": s.lineStyle as cytoscape.Css.LineStyle,
            "line-color": s.lineColor,
          },
        })),
        // Hover states
        {
          selector: "node:active",
          style: {
            "overlay-opacity": 0.1,
          },
        },
        // Dimmed state for filtering
        {
          selector: "node.dimmed",
          style: {
            opacity: 0.15,
          },
        },
        {
          selector: "edge.dimmed",
          style: {
            opacity: 0.05,
          },
        },
        // Highlighted state
        {
          selector: "node.highlighted",
          style: {
            "border-width": 3,
            "border-color": "#fff",
            width: 50,
            height: 50,
          },
        },
      ],
      layout: {
        name: layout,
        ...(layout === "cose"
          ? {
              idealEdgeLength: 120,
              nodeOverlap: 20,
              nodeRepulsion: () => 8000,
              gravity: 0.3,
              numIter: 500,
              animate: false,
            }
          : {}),
      },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });

    // Events
    cy.on("tap", "node", (evt) => {
      const nodeData = evt.target.data();
      const graphNode = nodes.find((n) => n.id === nodeData.id);
      if (graphNode && onNodeClick) onNodeClick(graphNode);
    });

    cy.on("dbltap", "node", (evt) => {
      const nodeData = evt.target.data();
      const graphNode = nodes.find((n) => n.id === nodeData.id);
      if (graphNode && onNodeDoubleClick) onNodeDoubleClick(graphNode);
    });

    cy.on("mouseover", "node", (evt) => {
      const nodeData = evt.target.data();
      const graphNode = nodes.find((n) => n.id === nodeData.id);
      if (graphNode) {
        const pos = evt.renderedPosition;
        setTooltip({ x: pos.x, y: pos.y, node: graphNode });
      }
      containerRef.current!.style.cursor = "pointer";
    });

    cy.on("mouseout", "node", () => {
      setTooltip(null);
      containerRef.current!.style.cursor = "default";
    });

    cy.on("pan zoom", () => {
      setTooltip(null);
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [nodes, edges, layout, onNodeClick, onNodeDoubleClick]);

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="w-full h-full" />
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none rounded-xl border border-white/10 bg-[#0f1729]/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: NODE_COLORS[tooltip.node.type] }}
            />
            <span className="font-medium text-foreground">{tooltip.node.label}</span>
          </div>
          <span className="text-[10px] text-muted-foreground capitalize">{tooltip.node.type}</span>
          {tooltip.node.type === "deal" && tooltip.node.meta.value != null && (
            <span className="text-[10px] text-muted-foreground ml-2">
              {"$"}{Number(tooltip.node.meta.value).toLocaleString()}
            </span>
          )}
          {tooltip.node.type === "contact" && tooltip.node.meta.company != null && (
            <span className="text-[10px] text-muted-foreground ml-2">
              {String(tooltip.node.meta.company as string)}
            </span>
          )}
          {tooltip.node.type === "group" && tooltip.node.meta.member_count != null && (
            <span className="text-[10px] text-muted-foreground ml-2">
              {String(tooltip.node.meta.member_count as number)} members
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Utility: highlight connected nodes
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
