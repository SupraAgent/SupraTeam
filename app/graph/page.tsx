"use client";

import * as React from "react";
import { KnowledgeGraph } from "@/components/graph/knowledge-graph";
import { PathFinder } from "@/components/graph/path-finder";
import { RelationshipDetailPanel } from "@/components/graph/relationship-detail-panel";
import { DealInfluencePanel } from "@/components/graph/deal-influence-panel";
import { DealSelector } from "@/components/graph/deal-selector";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type { GraphNode, GraphEdge, GraphViewMode, RelationshipType } from "@/lib/types";

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

const VIEW_MODES: { key: GraphViewMode; label: string }[] = [
  { key: "explorer", label: "Explorer" },
  { key: "relationships", label: "Relationships" },
  { key: "deal-influence", label: "Deal Influence" },
];

const NODE_COLORS: Record<string, string> = { deal: "#34d399", contact: "#60a5fa", group: "#a78bfa", doc: "#fbbf24" };

export default function GraphPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = React.useState<GraphViewMode>("explorer");
  const [nodes, setNodes] = React.useState<GraphNode[]>([]);
  const [edges, setEdges] = React.useState<GraphEdge[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [layout, setLayout] = React.useState<Layout>("cose");
  const [visibleTypes, setVisibleTypes] = React.useState<Set<string>>(new Set(["deal", "contact", "group", "doc"]));
  const [board, setBoard] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const [selectedNode, setSelectedNode] = React.useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = React.useState<GraphEdge | null>(null);
  const [companyCluster, setCompanyCluster] = React.useState(false);
  const [pathResult, setPathResult] = React.useState<string[] | undefined>();
  const [deals, setDeals] = React.useState<{ id: string; name: string; board_type: string }[]>([]);
  const [selectedDealId, setSelectedDealId] = React.useState<string | null>(null);
  const [dealInfo, setDealInfo] = React.useState<{ id: string; name: string; stage: { name: string; color: string } | null; value: number | null } | null>(null);
  const [timeline, setTimeline] = React.useState<{ date: string; event_type: string; description: string; contact_id?: string }[]>([]);
  const [timeRange, setTimeRange] = React.useState<"7d" | "30d" | "all">("all");

  const fetchExplorer = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("types", Array.from(visibleTypes).join(","));
      if (board !== "All") params.set("board", board);
      const res = await fetch(`/api/graph?${params}`);
      if (res.ok) { const data = await res.json(); setNodes(data.nodes ?? []); setEdges(data.edges ?? []); }
    } finally { setLoading(false); }
  }, [visibleTypes, board]);

  const fetchRelationships = React.useCallback(async (pathFrom?: string, pathTo?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: "relationships" });
      if (pathFrom && pathTo) { params.set("path_from", pathFrom); params.set("path_to", pathTo); }
      const res = await fetch(`/api/graph?${params}`);
      if (res.ok) { const data = await res.json(); setNodes(data.nodes ?? []); setEdges(data.edges ?? []); if (data.path) setPathResult(data.path); }
    } finally { setLoading(false); }
  }, []);

  const fetchDealInfluence = React.useCallback(async (dealId: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ deal_id: dealId });
      if (timeRange === "7d") params.set("time_from", new Date(Date.now() - 7 * 86400000).toISOString());
      else if (timeRange === "30d") params.set("time_from", new Date(Date.now() - 30 * 86400000).toISOString());
      const res = await fetch(`/api/graph/deal-influence?${params}`);
      if (res.ok) { const data = await res.json(); setNodes(data.nodes ?? []); setEdges(data.edges ?? []); setTimeline(data.timeline ?? []); setDealInfo(data.deal ?? null); }
    } finally { setLoading(false); }
  }, [timeRange]);

  const fetchDeals = React.useCallback(async () => {
    const res = await fetch("/api/deals?limit=200");
    if (res.ok) { const data = await res.json(); setDeals((data.data ?? []).map((d: { id: string; deal_name: string; board_type: string }) => ({ id: d.id, name: d.deal_name, board_type: d.board_type }))); }
  }, []);

  React.useEffect(() => {
    setSelectedNode(null); setSelectedEdge(null); setPathResult(undefined);
    if (viewMode === "explorer") fetchExplorer();
    else if (viewMode === "relationships") fetchRelationships();
    else if (viewMode === "deal-influence") { fetchDeals(); if (selectedDealId) fetchDealInfluence(selectedDealId); else { setNodes([]); setEdges([]); setLoading(false); } }
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { if (viewMode === "explorer") fetchExplorer(); }, [visibleTypes, board, fetchExplorer, viewMode]);
  React.useEffect(() => { if (viewMode === "deal-influence" && selectedDealId) fetchDealInfluence(selectedDealId); }, [selectedDealId, timeRange, fetchDealInfluence, viewMode]);

  const toggleType = (type: string) => { setVisibleTypes((prev) => { const next = new Set(prev); if (next.has(type)) { if (next.size > 1) next.delete(type); } else { next.add(type); } return next; }); };

  const filteredNodes = React.useMemo(() => {
    let result = nodes;
    if (search) result = result.filter((n) => n.label.toLowerCase().includes(search.toLowerCase()));
    if (viewMode === "relationships" && companyCluster) {
      const companies = new Set<string>();
      const withParents = result.map((n) => { if (n.type === "contact" && typeof n.meta.company === "string") { companies.add(n.meta.company); return { ...n, parent: `company-${n.meta.company}` }; } return n; });
      const companyNodes: GraphNode[] = [...companies].map((c) => ({ id: `company-${c}`, type: "contact" as const, label: c, meta: { isCompanyGroup: true } }));
      result = [...companyNodes, ...withParents];
    }
    return result;
  }, [nodes, search, viewMode, companyCluster]);

  const nodeIdSet = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));

  const handleNodeClick = React.useCallback((node: GraphNode) => { setSelectedNode(node); setSelectedEdge(null); }, []);
  const handleEdgeClick = React.useCallback((edge: GraphEdge) => { if (edge.type === "contact_contact") { setSelectedEdge(edge); setSelectedNode(null); } }, []);
  const handleNodeDoubleClick = React.useCallback((node: GraphNode) => {
    switch (node.type) {
      case "deal": router.push(`/pipeline?highlight=${node.id}`); break;
      case "contact": router.push(`/contacts?highlight=${node.id}`); break;
      case "group": router.push("/groups"); break;
      case "doc": router.push(`/docs?edit=${node.id}`); break;
    }
  }, [router]);
  const handleFindPath = async (fromId: string, toId: string) => { await fetchRelationships(fromId, toId); };
  const handleAddRelationship = async (contactAId: string, contactBId: string, type: RelationshipType) => {
    await fetch("/api/graph/relationships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_a_id: contactAId, contact_b_id: contactBId, relationship_type: type }) });
    fetchRelationships();
  };

  const stats = { deals: nodes.filter((n) => n.type === "deal").length, contacts: nodes.filter((n) => n.type === "contact").length, groups: nodes.filter((n) => n.type === "group").length, docs: nodes.filter((n) => n.type === "doc").length };
  const contactsForPathFinder = nodes.filter((n) => n.type === "contact").map((n) => ({ id: n.id, name: n.label, company: (typeof n.meta.company === "string" ? n.meta.company : null) }));
  const participantNodes = nodes.filter((n) => n.type === "contact");
  const effectiveLayout = viewMode === "deal-influence" ? "concentric" as Layout : layout;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {viewMode === "explorer" ? "Knowledge Graph" : viewMode === "relationships" ? "Relationship Intelligence" : "Deal Influence Network"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{filteredNodes.length} nodes &middot; {filteredEdges.length} connections</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {VIEW_MODES.map((m) => (<button key={m.key} onClick={() => setViewMode(m.key)} className={cn("px-2.5 py-1.5 text-xs transition", viewMode === m.key ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]")}>{m.label}</button>))}
          </div>
          {viewMode === "deal-influence" && (
            <>
              <DealSelector deals={deals} selectedDealId={selectedDealId} onSelect={setSelectedDealId} className="w-56" />
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                {(["7d", "30d", "all"] as const).map((tr) => (<button key={tr} onClick={() => setTimeRange(tr)} className={cn("px-2 py-1.5 text-xs transition", timeRange === tr ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}>{tr === "all" ? "All" : tr}</button>))}
              </div>
            </>
          )}
          {viewMode !== "deal-influence" && <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search nodes..." className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 w-48" />}
          {viewMode === "explorer" && (
            <select value={board} onChange={(e) => setBoard(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-foreground focus:outline-none">
              <option value="All">All Boards</option><option value="BD">BD</option><option value="Marketing">Marketing</option><option value="Admin">Admin</option>
            </select>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 border-r border-white/10 p-3 space-y-4 shrink-0 hidden lg:block overflow-y-auto">
          {viewMode === "explorer" && (
            <div>
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2">Entity Types</h3>
              <div className="space-y-1">
                {ENTITY_TYPES.map((t) => (<button key={t.key} onClick={() => toggleType(t.key)} className={cn("flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-xs transition", visibleTypes.has(t.key) ? "bg-white/[0.06] text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground")}><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: visibleTypes.has(t.key) ? t.color : `${t.color}30` }} />{t.label}<span className="ml-auto text-[10px] text-muted-foreground/50">{stats[t.key as keyof typeof stats]}</span></button>))}
              </div>
            </div>
          )}
          {viewMode === "relationships" && (
            <>
              <PathFinder contacts={contactsForPathFinder} onFindPath={handleFindPath} onClear={() => { setPathResult(undefined); fetchRelationships(); }} pathResult={pathResult} />
              <button onClick={() => setCompanyCluster(!companyCluster)} className={cn("w-full rounded-lg px-2 py-1.5 text-xs text-left transition", companyCluster ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.03]")}>{companyCluster ? "✓ " : ""}Company Clustering</button>
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Legend</h3>
                <div className="space-y-1 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-2"><span className="h-0.5 w-4 bg-[#60a5fa60]" /><span>Contact connection</span></div>
                  <div className="flex items-center gap-2"><span className="h-0.5 w-4 bg-[#a78bfa60]" /><span>Group membership</span></div>
                  <p className="mt-1">Edge thickness = strength</p>
                  <p>Node size = connections</p>
                </div>
              </div>
            </>
          )}
          {viewMode === "deal-influence" && <DealInfluencePanel deal={dealInfo} participants={participantNodes} timeline={timeline} />}
          {viewMode !== "deal-influence" && (
            <div>
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2">Layout</h3>
              <div className="space-y-1">
                {LAYOUTS.map((l) => (<button key={l.key} onClick={() => setLayout(l.key)} className={cn("w-full rounded-lg px-2 py-1.5 text-xs text-left transition", layout === l.key ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.03]")}>{l.label}</button>))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          {loading ? (
            <div className="flex items-center justify-center h-full"><div className="text-sm text-muted-foreground animate-pulse">Loading graph...</div></div>
          ) : filteredNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <p className="text-sm text-muted-foreground">{viewMode === "deal-influence" && !selectedDealId ? "Select a deal to view its influence network." : "No nodes to display."}</p>
              <p className="text-xs text-muted-foreground/50">{viewMode === "deal-influence" && !selectedDealId ? "Use the deal selector above." : "Create deals, contacts, or docs to see them here."}</p>
            </div>
          ) : (
            <KnowledgeGraph nodes={filteredNodes} edges={filteredEdges} layout={effectiveLayout} viewMode={viewMode} highlightPath={pathResult} onNodeClick={handleNodeClick} onNodeDoubleClick={handleNodeDoubleClick} onEdgeClick={handleEdgeClick} className="w-full h-full" />
          )}
        </div>

        {selectedEdge && viewMode === "relationships" ? (
          <div className="w-72 border-l border-white/10 p-4 shrink-0 hidden lg:block">
            <RelationshipDetailPanel edge={selectedEdge} nodes={nodes} onClose={() => setSelectedEdge(null)} onAddRelationship={handleAddRelationship} />
          </div>
        ) : selectedNode ? (
          <div className="w-72 border-l border-white/10 p-4 space-y-3 shrink-0 hidden lg:block">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: NODE_COLORS[selectedNode.type] }} /><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">{selectedNode.type}</span></div>
              <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground text-xs">&times;</button>
            </div>
            <h3 className="text-sm font-medium text-foreground">{selectedNode.label}</h3>
            <div className="space-y-1.5">
              {Object.entries(selectedNode.meta).map(([key, val]) => {
                if (!val || key === "stage" || key === "isCompanyGroup") return null;
                return (<div key={key} className="flex items-center justify-between text-xs"><span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span><span className="text-foreground">{typeof val === "object" ? JSON.stringify(val) : String(val as string | number)}</span></div>);
              })}
              {selectedNode.type === "deal" && typeof selectedNode.meta.stage === "object" && selectedNode.meta.stage != null ? (
                <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Stage</span><span className="text-foreground">{(selectedNode.meta.stage as { name: string }).name}</span></div>
              ) : null}
            </div>
            <div>
              <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1.5">Connected</h4>
              <div className="space-y-1">
                {edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).map((e, i) => {
                  const otherId = e.source === selectedNode.id ? e.target : e.source;
                  const other = nodes.find((n) => n.id === otherId);
                  if (!other) return null;
                  return (<button key={i} onClick={() => setSelectedNode(other)} className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1 text-xs hover:bg-white/[0.03] transition"><span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: NODE_COLORS[other.type] }} /><span className="text-foreground truncate">{other.label}</span>{typeof e.strength === "number" ? <span className="ml-auto text-[9px] text-muted-foreground/40">{e.strength}</span> : null}</button>);
                })}
              </div>
            </div>
            <button onClick={() => handleNodeDoubleClick(selectedNode)} className="w-full rounded-lg bg-primary/20 text-primary text-xs font-medium py-2 hover:bg-primary/30 transition">Open {selectedNode.type}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
