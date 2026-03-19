"use client";

import * as React from "react";
import { KnowledgeGraph } from "@/components/graph/knowledge-graph";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

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

type Layout = "cose" | "grid" | "circle" | "concentric";

const ENTITY_TYPES = [
  { key: "deal", label: "Deals", color: "#34d399" },
  { key: "contact", label: "Contacts", color: "#60a5fa" },
  { key: "group", label: "TG Groups", color: "#a78bfa" },
  { key: "doc", label: "Docs", color: "#fbbf24" },
] as const;

const LAYOUTS: { key: Layout; label: string }[] = [
  { key: "cose", label: "Force" },
  { key: "grid", label: "Grid" },
  { key: "circle", label: "Circle" },
  { key: "concentric", label: "Concentric" },
];

export default function GraphPage() {
  const router = useRouter();
  const [nodes, setNodes] = React.useState<GraphNode[]>([]);
  const [edges, setEdges] = React.useState<GraphEdge[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [layout, setLayout] = React.useState<Layout>("cose");
  const [visibleTypes, setVisibleTypes] = React.useState<Set<string>>(
    new Set(["deal", "contact", "group", "doc"])
  );
  const [board, setBoard] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const [selectedNode, setSelectedNode] = React.useState<GraphNode | null>(null);

  const fetchGraph = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("types", Array.from(visibleTypes).join(","));
      if (board !== "All") params.set("board", board);

      const res = await fetch(`/api/graph?${params}`);
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes ?? []);
        setEdges(data.edges ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [visibleTypes, board]);

  React.useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const toggleType = (type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Filter nodes by search
  const filteredNodes = search
    ? nodes.filter((n) => n.label.toLowerCase().includes(search.toLowerCase()))
    : nodes;

  // Filter edges to only include visible nodes
  const nodeIdSet = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
  );

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
  };

  const handleNodeDoubleClick = (node: GraphNode) => {
    switch (node.type) {
      case "deal":
        router.push(`/pipeline?highlight=${node.id}`);
        break;
      case "contact":
        router.push(`/contacts?highlight=${node.id}`);
        break;
      case "group":
        router.push("/groups");
        break;
      case "doc":
        router.push(`/docs?edit=${node.id}`);
        break;
    }
  };

  const stats = {
    deals: nodes.filter((n) => n.type === "deal").length,
    contacts: nodes.filter((n) => n.type === "contact").length,
    groups: nodes.filter((n) => n.type === "group").length,
    docs: nodes.filter((n) => n.type === "doc").length,
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Knowledge Graph</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filteredNodes.length} nodes &middot; {filteredEdges.length} connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 w-48"
          />
          {/* Board filter */}
          <select
            value={board}
            onChange={(e) => setBoard(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="All">All Boards</option>
            <option value="BD">BD</option>
            <option value="Marketing">Marketing</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left filter panel */}
        <div className="w-48 border-r border-white/10 p-3 space-y-4 shrink-0 hidden lg:block">
          {/* Entity type toggles */}
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2">
              Entity Types
            </h3>
            <div className="space-y-1">
              {ENTITY_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => toggleType(t.key)}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-xs transition",
                    visibleTypes.has(t.key)
                      ? "bg-white/[0.06] text-foreground"
                      : "text-muted-foreground/40 hover:text-muted-foreground"
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: visibleTypes.has(t.key) ? t.color : `${t.color}30`,
                    }}
                  />
                  {t.label}
                  <span className="ml-auto text-[10px] text-muted-foreground/50">
                    {stats[t.key as keyof typeof stats]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Layout selector */}
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2">
              Layout
            </h3>
            <div className="space-y-1">
              {LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => setLayout(l.key)}
                  className={cn(
                    "w-full rounded-lg px-2 py-1.5 text-xs text-left transition",
                    layout === l.key
                      ? "bg-white/[0.06] text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.03]"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Graph canvas */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-muted-foreground animate-pulse">Loading graph...</div>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <p className="text-sm text-muted-foreground">No nodes to display.</p>
              <p className="text-xs text-muted-foreground/50">Create deals, contacts, or docs to see them here.</p>
            </div>
          ) : (
            <KnowledgeGraph
              nodes={filteredNodes}
              edges={filteredEdges}
              layout={layout}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              className="w-full h-full"
            />
          )}
        </div>

        {/* Right detail panel */}
        {selectedNode && (
          <div className="w-72 border-l border-white/10 p-4 space-y-3 shrink-0 hidden lg:block">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: NODE_COLORS[selectedNode.type] }}
                />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {selectedNode.type}
                </span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                &times;
              </button>
            </div>

            <h3 className="text-sm font-medium text-foreground">{selectedNode.label}</h3>

            {/* Meta info */}
            <div className="space-y-1.5">
              {Object.entries(selectedNode.meta).map(([key, val]) => {
                if (!val || key === "stage") return null;
                return (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                    <span className="text-foreground">{typeof val === "object" ? JSON.stringify(val) : String(val as string | number)}</span>
                  </div>
                );
              })}
              {selectedNode.type === "deal" && selectedNode.meta.stage != null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Stage</span>
                  <span className="text-foreground">
                    {(selectedNode.meta.stage as { name: string }).name}
                  </span>
                </div>
              )}
            </div>

            {/* Connected nodes */}
            <div>
              <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1.5">
                Connected
              </h4>
              <div className="space-y-1">
                {edges
                  .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                  .map((e, i) => {
                    const otherId = e.source === selectedNode.id ? e.target : e.source;
                    const other = nodes.find((n) => n.id === otherId);
                    if (!other) return null;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedNode(other)}
                        className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1 text-xs hover:bg-white/[0.03] transition"
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: NODE_COLORS[other.type] }}
                        />
                        <span className="text-foreground truncate">{other.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Navigate button */}
            <button
              onClick={() => handleNodeDoubleClick(selectedNode)}
              className="w-full rounded-lg bg-primary/20 text-primary text-xs font-medium py-2 hover:bg-primary/30 transition"
            >
              Open {selectedNode.type}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const NODE_COLORS: Record<string, string> = {
  deal: "#34d399",
  contact: "#60a5fa",
  group: "#a78bfa",
  doc: "#fbbf24",
};
