"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { DealListView } from "@/components/pipeline/deal-list-view";
import { CreateDealModal } from "@/components/pipeline/create-deal-modal";
import { DealDetailPanel } from "@/components/pipeline/deal-detail-panel";
import { AutomateDealModal, type WorkflowTemplate } from "@/components/pipeline/automate-deal-modal";
import { PipelineFilterBar } from "@/components/pipeline/pipeline-filter-bar";
import { BulkActionBar } from "@/components/pipeline/bulk-action-bar";
import { AISuggestionsPanel } from "@/components/pipeline/ai-suggestions-panel";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LayoutGrid, List, Search, DollarSign, Filter, Brain, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import type { Deal, PipelineStage, Contact, BoardType } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PipelineFilters = {
  minValue: number | null;
  maxValue: number | null;
  minProbability: number | null;
  maxProbability: number | null;
  assignedTo: string | null;
  staleDays: number | null;
  outcome: string | null;
};

const EMPTY_FILTERS: PipelineFilters = {
  minValue: null, maxValue: null, minProbability: null, maxProbability: null,
  assignedTo: null, staleDays: null, outcome: null,
};

const BOARDS: BoardType[] = ["All", "BD", "Marketing", "Admin", "Applications"];

const SAMPLE_BASE = {
  contact_id: null, assigned_to: null, telegram_chat_id: null, telegram_chat_name: null,
  telegram_chat_link: null, outcome: null, outcome_reason: null, outcome_at: null,
  health_score: null, expected_close_date: null, created_by: null,
  contact: null, assigned_profile: null,
} as const;

function makeSampleDeals(stages: PipelineStage[]): Deal[] {
  if (stages.length < 3) return [];
  const now = new Date().toISOString();
  return [
    {
      ...SAMPLE_BASE, id: "sample-1", deal_name: "Acme Corp Partnership",
      board_type: "BD", stage_id: stages[0].id, value: 50000, probability: 30,
      stage_changed_at: now, created_at: now, updated_at: now, stage: stages[0],
    },
    {
      ...SAMPLE_BASE, id: "sample-2", deal_name: "DeFi Protocol Integration",
      board_type: "BD", stage_id: stages[1].id, value: 120000, probability: 50,
      stage_changed_at: now, created_at: now, updated_at: now, stage: stages[1],
    },
    {
      ...SAMPLE_BASE, id: "sample-3", deal_name: "Exchange Listing Sponsorship",
      board_type: "Marketing", stage_id: stages[2].id, value: 25000, probability: 60,
      stage_changed_at: now, created_at: now, updated_at: now, stage: stages[2],
    },
    {
      ...SAMPLE_BASE, id: "sample-4", deal_name: "Node Operator MOU",
      board_type: "Admin", stage_id: stages[4]?.id ?? stages[2].id, value: 75000, probability: 80,
      stage_changed_at: now, created_at: now, updated_at: now, stage: stages[4] ?? stages[2],
    },
  ];
}

export default function PipelinePage() {
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const contactsFetched = React.useRef(false);
  const [board, setBoard] = React.useState<BoardType>("All");
  const [viewMode, setViewMode] = React.useState<"kanban" | "list">("kanban");
  // Sync view mode to screen width after mount to avoid SSR hydration mismatch
  React.useEffect(() => {
    if (window.innerWidth < 640) setViewMode("list");
  }, []);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null);
  const [automateDeal, setAutomateDeal] = React.useState<Deal | null>(null);
  const [workflowTemplates, setWorkflowTemplates] = React.useState<WorkflowTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = React.useState(false);
  const templatesFetched = React.useRef(false);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [usingSamples, setUsingSamples] = React.useState(false);
  const [highlightDealId, setHighlightDealId] = React.useState<string | null>(null);
  const [highlightedDealIds, setHighlightedDealIds] = React.useState<Set<string>>(new Set());
  const [highlightDetails, setHighlightDetails] = React.useState<Record<string, { priority?: string; sentiment?: string; message_count?: number; sender_name?: string }>>({});
  const [filters, setFilters] = React.useState<PipelineFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = React.useState(false);
  const [selectedDealIds, setSelectedDealIds] = React.useState<Set<string>>(new Set());
  // AI Insights
  const [insights, setInsights] = React.useState<string | null>(null);
  const [insightsStats, setInsightsStats] = React.useState<{
    total: number; totalValue: number; avgHealth: number; atRisk: number;
    sentimentCounts?: Record<string, number>; momentumCounts?: Record<string, number>;
  } | null>(null);
  const [insightsLoading, setInsightsLoading] = React.useState(false);
  const [showInsights, setShowInsights] = React.useState(false);
  const [bulkSentimentLoading, setBulkSentimentLoading] = React.useState(false);
  const [unreadCounts, setUnreadCounts] = React.useState<Record<string, number>>({});
  const [showSuggestions, setShowSuggestions] = React.useState(true);

  const searchParams = useSearchParams();
  const router = useRouter();

  // Refs to avoid stale closures in sync functions
  const filtersRef = React.useRef(filters);
  const boardRef = React.useRef(board);
  const searchRef = React.useRef(search);
  filtersRef.current = filters;
  boardRef.current = board;
  searchRef.current = search;

  // ── Sync filters from URL on mount ──────────────────────────────
  const initializedFromUrl = React.useRef(false);
  React.useEffect(() => {
    if (initializedFromUrl.current) return;
    initializedFromUrl.current = true;

    const urlBoard = searchParams.get("board");
    if (urlBoard && BOARDS.includes(urlBoard as BoardType)) {
      setBoard(urlBoard as BoardType);
    }
    const urlSearch = searchParams.get("q");
    if (urlSearch) setSearch(urlSearch);

    const parsed: Partial<PipelineFilters> = {};
    const minV = searchParams.get("minValue");
    const maxV = searchParams.get("maxValue");
    const minP = searchParams.get("minProbability");
    const maxP = searchParams.get("maxProbability");
    const assigned = searchParams.get("assignedTo");
    const stale = searchParams.get("staleDays");
    const outcome = searchParams.get("outcome");
    if (minV) parsed.minValue = Number(minV);
    if (maxV) parsed.maxValue = Number(maxV);
    if (minP) parsed.minProbability = Number(minP);
    if (maxP) parsed.maxProbability = Number(maxP);
    if (assigned) parsed.assignedTo = assigned;
    if (stale) parsed.staleDays = Number(stale);
    if (outcome) parsed.outcome = outcome;

    if (Object.keys(parsed).length > 0) {
      setFilters({ ...EMPTY_FILTERS, ...parsed });
      setShowFilters(true);
    }
  }, [searchParams]);

  // ── Sync filters to URL ─────────────────────────────────────────
  const syncFiltersToUrl = React.useCallback((f: PipelineFilters, b: BoardType, q: string) => {
    const params = new URLSearchParams();
    if (b !== "All") params.set("board", b);
    if (q) params.set("q", q);
    if (f.minValue != null) params.set("minValue", String(f.minValue));
    if (f.maxValue != null) params.set("maxValue", String(f.maxValue));
    if (f.minProbability != null) params.set("minProbability", String(f.minProbability));
    if (f.maxProbability != null) params.set("maxProbability", String(f.maxProbability));
    if (f.assignedTo) params.set("assignedTo", f.assignedTo);
    if (f.staleDays != null) params.set("staleDays", String(f.staleDays));
    if (f.outcome) params.set("outcome", f.outcome);
    const qs = params.toString();
    router.replace(qs ? `/pipeline?${qs}` : "/pipeline", { scroll: false });
  }, [router]);

  function setFiltersAndSync(f: PipelineFilters) {
    setFilters(f);
    syncFiltersToUrl(f, boardRef.current, searchRef.current);
  }

  function setBoardAndSync(b: BoardType) {
    setBoard(b);
    syncFiltersToUrl(filtersRef.current, b, searchRef.current);
  }

  function setSearchAndSync(q: string) {
    setSearch(q);
    syncFiltersToUrl(filtersRef.current, boardRef.current, q);
  }

  // Unique assigned profiles for filter dropdown
  const assignedProfiles = React.useMemo(() => {
    const map = new Map<string, { id: string; display_name: string }>();
    for (const d of deals) {
      if (d.assigned_to && d.assigned_profile) {
        map.set(d.assigned_to, { id: d.assigned_to, display_name: d.assigned_profile.display_name });
      }
    }
    return Array.from(map.values());
  }, [deals]);

  const hasActiveFilters = filters.minValue != null || filters.maxValue != null ||
    filters.minProbability != null || filters.maxProbability != null ||
    filters.assignedTo != null || filters.staleDays != null || filters.outcome != null;

  // Handle ?highlight=deal-id
  React.useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (highlight) {
      setHighlightDealId(highlight);
      // Scroll to the deal card after a short delay
      setTimeout(() => {
        const el = document.querySelector(`[data-deal-id="${CSS.escape(highlight)}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
      }, 500);
      // Clear highlight after 4 seconds (preserve other params)
      setTimeout(() => {
        setHighlightDealId(null);
        const params = new URLSearchParams(window.location.search);
        params.delete("highlight");
        const qs = params.toString();
        router.replace(qs ? `/pipeline?${qs}` : "/pipeline", { scroll: false });
      }, 4000);
    }
  }, [searchParams, router]);

  const fetchData = React.useCallback(async () => {
    try {
      const [stagesRes, dealsRes, highlightsRes, unreadRes] = await Promise.all([
        fetch("/api/pipeline"),
        fetch("/api/deals"),
        fetch("/api/highlights"),
        fetch("/api/deals/unread-counts"),
      ]);

      let fetchedStages: PipelineStage[] = [];
      let fetchedDeals: Deal[] = [];

      if (stagesRes.ok) {
        const data = await stagesRes.json();
        fetchedStages = data.stages ?? [];
        setStages(fetchedStages);
      }
      if (dealsRes.ok) {
        const data = await dealsRes.json();
        fetchedDeals = data.deals ?? [];
        setDeals(fetchedDeals);
      }
      if (highlightsRes.ok) {
        const { highlighted_deal_ids, highlights: hlList } = await highlightsRes.json();
        setHighlightedDealIds(new Set(highlighted_deal_ids ?? []));
        // Build a details map keyed by deal_id (use highest priority highlight per deal)
        const detailsMap: Record<string, { priority?: string; sentiment?: string; message_count?: number; sender_name?: string }> = {};
        const priorityRank: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
        for (const h of hlList ?? []) {
          if (!h.deal_id) continue;
          const existing = detailsMap[h.deal_id];
          if (!existing || (priorityRank[h.priority] ?? 0) > (priorityRank[existing.priority ?? ""] ?? 0)) {
            detailsMap[h.deal_id] = {
              priority: h.priority,
              sentiment: h.sentiment,
              message_count: h.message_count,
              sender_name: h.sender_name,
            };
          }
        }
        setHighlightDetails(detailsMap);
      }

      if (unreadRes.ok) {
        const unreadData = await unreadRes.json();
        setUnreadCounts(unreadData.counts ?? {});
      }

      // Refresh contacts if previously loaded (non-blocking)
      if (contactsFetched.current) {
        fetch("/api/contacts").then((r) => r.ok ? r.json() : null).then((d) => {
          if (d) setContacts(d.contacts ?? []);
        }).catch(() => {});
      }

      // Show sample deals if no real deals exist
      if (fetchedDeals.length === 0 && fetchedStages.length > 0) {
        setDeals(makeSampleDeals(fetchedStages));
        setUsingSamples(true);
      } else {
        setUsingSamples(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Track active undo toasts and in-flight move requests per deal
  const undoToastIds = React.useRef<Map<string, string | number>>(new Map());
  const moveControllers = React.useRef<Map<string, AbortController>>(new Map());

  async function handleMoveDeal(dealId: string, newStageId: string) {
    if (dealId.startsWith("sample-")) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;
    const oldStageId = deal.stage_id;
    const oldStage = deal.stage;
    if (oldStageId === newStageId) return;

    // Abort any in-flight PATCH for this deal and dismiss its undo toast
    const prevController = moveControllers.current.get(dealId);
    if (prevController) prevController.abort();
    const prevToast = undoToastIds.current.get(dealId);
    if (prevToast) toast.dismiss(prevToast);

    const controller = new AbortController();
    moveControllers.current.set(dealId, controller);

    // Optimistic update
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId
          ? { ...d, stage_id: newStageId, stage: stages.find((s) => s.id === newStageId) ?? d.stage }
          : d
      )
    );

    let res: Response;
    try {
      res = await fetch(`/api/deals/${dealId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: newStageId }),
        signal: controller.signal,
      });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return; // superseded by newer move
      toast.error("Failed to move deal");
      fetchData();
      return;
    } finally {
      // Clean up only if this controller is still the active one
      if (moveControllers.current.get(dealId) === controller) {
        moveControllers.current.delete(dealId);
      }
    }

    if (!res.ok) {
      toast.error("Failed to move deal");
      fetchData();
      return;
    }

    // Capture the stage the deal is at RIGHT NOW for undo (not the stale closure value)
    const undoToStageId = oldStageId;
    const undoToStage = oldStage;
    const newStageName = stages.find((s) => s.id === newStageId)?.name ?? "stage";
    const toastId = toast(`Moved "${deal.deal_name}" to ${newStageName}`, {
      action: {
        label: "Undo",
        onClick: async () => {
          // Check the deal's current stage before reverting — bail if it's been moved again
          const currentDeal = deals.find((d) => d.id === dealId);
          if (currentDeal && currentDeal.stage_id !== newStageId) return; // deal was re-moved

          setDeals((prev) =>
            prev.map((d) =>
              d.id === dealId
                ? { ...d, stage_id: undoToStageId, stage: undoToStage }
                : d
            )
          );
          const undoRes = await fetch(`/api/deals/${dealId}/move`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage_id: undoToStageId }),
          });
          if (!undoRes.ok) {
            toast.error("Failed to undo move");
            fetchData();
          }
        },
      },
      duration: 5000,
    });
    undoToastIds.current.set(dealId, toastId);
  }

  // Search + advanced filters
  const searchFiltered = React.useMemo(() => {
    let result = deals;

    // Text search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((d) =>
        d.deal_name.toLowerCase().includes(q) ||
        d.contact?.name?.toLowerCase().includes(q) ||
        d.contact?.company?.toLowerCase().includes(q)
      );
    }

    // Advanced filters
    if (filters.minValue != null) result = result.filter((d) => Number(d.value ?? 0) >= filters.minValue!);
    if (filters.maxValue != null) result = result.filter((d) => Number(d.value ?? 0) <= filters.maxValue!);
    if (filters.minProbability != null) result = result.filter((d) => Number(d.probability ?? 0) >= filters.minProbability!);
    if (filters.maxProbability != null) result = result.filter((d) => Number(d.probability ?? 0) <= filters.maxProbability!);
    if (filters.assignedTo === "__unassigned") {
      result = result.filter((d) => !d.assigned_to);
    } else if (filters.assignedTo) {
      result = result.filter((d) => d.assigned_to === filters.assignedTo);
    }
    if (filters.outcome) result = result.filter((d) => (d.outcome ?? "open") === filters.outcome);
    if (filters.staleDays != null) {
      const cutoff = Date.now() - filters.staleDays * 86400000;
      result = result.filter((d) => new Date(d.stage_changed_at).getTime() < cutoff);
    }

    return result;
  }, [deals, search, filters]);

  // Filter stages by active board (Applications has its own stages, others share legacy stages)
  const activeStages = React.useMemo(() => {
    if (board === "Applications") return stages.filter((s) => s.board_type === "Applications");
    return stages.filter((s) => !s.board_type);
  }, [stages, board]);

  // Pipeline summary (uses filtered deals so stats reflect current view)
  const totalValue = searchFiltered.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
  const weightedValue = searchFiltered.reduce((sum, d) => sum + Number(d.value ?? 0) * (Number(d.probability ?? 50) / 100), 0);

  // Bulk actions
  function toggleSelectDeal(dealId: string) {
    if (dealId.startsWith("sample-")) return;
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      next.has(dealId) ? next.delete(dealId) : next.add(dealId);
      return next;
    });
  }

  function selectAllVisible() {
    const boardFiltered = board === "All" ? searchFiltered : searchFiltered.filter((d) => d.board_type === board);
    setSelectedDealIds(new Set(boardFiltered.filter((d) => !d.id.startsWith("sample-")).map((d) => d.id)));
  }

  function clearSelection() {
    setSelectedDealIds(new Set());
  }

  async function handleBulkMove(stageId: string) {
    const ids = Array.from(selectedDealIds);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/deals/${id}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage_id: stageId }),
        })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    toast.success(`Moved ${succeeded} deal${succeeded !== 1 ? "s" : ""}`);
    clearSelection();
    fetchData();
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedDealIds);
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/deals/${id}`, { method: "DELETE" }))
    );
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    toast.success(`Deleted ${succeeded} deal${succeeded !== 1 ? "s" : ""}`);
    clearSelection();
    fetchData();
  }

  async function handleBulkOutcome(outcome: string) {
    const ids = Array.from(selectedDealIds);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/deals/${id}/outcome`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome }),
        })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    toast.success(`Marked ${succeeded} deal${succeeded !== 1 ? "s" : ""} as ${outcome}`);
    clearSelection();
    fetchData();
  }

  async function handleQuickOutcome(dealId: string, outcome: string) {
    if (dealId.startsWith("sample-")) return;
    const res = await fetch(`/api/deals/${dealId}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    if (res.ok) {
      toast.success(`Deal marked as ${outcome}`);
      fetchData();
    } else {
      toast.error("Failed to update outcome");
    }
  }

  async function handleInlineEdit(dealId: string, field: string, val: number | null) {
    if (dealId.startsWith("sample-")) return;
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: val }),
    });
    if (res.ok) {
      setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, [field]: val } : d));
    } else {
      toast.error("Failed to update");
    }
  }

  async function handleBulkSentiment() {
    setBulkSentimentLoading(true);
    try {
      const res = await fetch("/api/deals/bulk-sentiment", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Analyzed sentiment for ${data.analyzed} deal${data.analyzed !== 1 ? "s" : ""}`);
        fetchData();
      }
    } finally {
      setBulkSentimentLoading(false);
    }
  }

  async function handleToggleInsights() {
    if (showInsights) { setShowInsights(false); return; }
    setInsightsLoading(true);
    setShowInsights(true);
    try {
      const res = await fetch("/api/deals/pipeline-insights");
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights);
        setInsightsStats(data.stats);
      }
    } finally {
      setInsightsLoading(false);
    }
  }

  // Fetch contacts lazily — only when "Add Deal" is first opened
  function handleOpenCreateDeal() {
    setCreateOpen(true);
    if (!contactsFetched.current) {
      contactsFetched.current = true;
      fetch("/api/contacts")
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        })
        .then((d) => setContacts(d.contacts ?? []))
        .catch(() => {
          contactsFetched.current = false;
        });
    }
  }

  // Fetch workflow templates once (lazy — on first automate action)
  function handleAutomateDeal(deal: Deal) {
    setAutomateDeal(deal);
    if (!templatesFetched.current) {
      templatesFetched.current = true;
      setTemplatesLoading(true);
      fetch("/api/workflow-templates")
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        })
        .then((d) => setWorkflowTemplates(d.templates ?? []))
        .catch(() => {
          templatesFetched.current = false; // allow retry
        })
        .finally(() => setTemplatesLoading(false));
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="flex gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="min-w-[260px] h-[300px] rounded-xl bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
            Drag deals between stages. Filter by BD, Marketing, or Admin board.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex gap-0.5 rounded-lg border border-white/10 p-0.5">
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "kanban" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="Kanban view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "list" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Board filter */}
          <div className="flex gap-1 overflow-x-auto">
            {BOARDS.map((tab) => {
              const count = tab === "All" ? searchFiltered.length : searchFiltered.filter((d) => d.board_type === tab).length;
              return (
                <button
                  key={tab}
                  onClick={() => setBoardAndSync(tab)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                    board === tab
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  {tab}
                  {count > 0 && !usingSamples && (
                    <span className="ml-1 text-muted-foreground/60">({count})</span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              showFilters || hasActiveFilters
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
            title="Advanced filters"
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => setSearchAndSync(e.target.value)}
              placeholder="Search deals..."
              className="h-8 w-[160px] pl-7 text-xs"
            />
          </div>
          <Button size="sm" onClick={handleOpenCreateDeal}>
            Add Deal
          </Button>
        </div>
      </div>

      {/* Pipeline stats bar */}
      {!usingSamples && deals.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{deals.length} deal{deals.length !== 1 ? "s" : ""}</span>
          <span className="text-white/10">|</span>
          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{Math.round(totalValue).toLocaleString()} pipeline</span>
          <span className="text-white/10">|</span>
          <span>${Math.round(weightedValue).toLocaleString()} weighted</span>
          {search && <span className="text-primary ml-auto">{searchFiltered.length} match{searchFiltered.length !== 1 ? "es" : ""}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleBulkSentiment}
              disabled={bulkSentimentLoading}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
            >
              <Brain className="h-3 w-3" />
              {bulkSentimentLoading ? "Analyzing..." : "Bulk Sentiment"}
            </button>
            <button
              onClick={handleToggleInsights}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              AI Insights
              {showInsights ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            </button>
          </div>
        </div>
      )}

      {/* AI Pipeline Insights panel */}
      {showInsights && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          {insightsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
              Generating pipeline insights...
            </div>
          ) : (
            <>
              {insightsStats && (
                <div className="flex flex-wrap gap-3 text-[10px]">
                  <span className="rounded-full bg-white/10 px-2 py-0.5">{insightsStats.total} open deals</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5">${insightsStats.totalValue?.toLocaleString()} total</span>
                  <span className={cn("rounded-full px-2 py-0.5", (insightsStats.avgHealth ?? 0) >= 60 ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400")}>
                    Avg health: {insightsStats.avgHealth}%
                  </span>
                  {(insightsStats.atRisk ?? 0) > 0 && (
                    <span className="rounded-full bg-red-500/20 text-red-400 px-2 py-0.5">{insightsStats.atRisk} at risk</span>
                  )}
                  {insightsStats.sentimentCounts && Object.entries(insightsStats.sentimentCounts).filter(([, v]) => v > 0).map(([k, v]) => (
                    <span key={k} className={cn("rounded-full px-2 py-0.5",
                      k === "positive" ? "bg-emerald-500/10 text-emerald-400" :
                      k === "negative" ? "bg-red-500/10 text-red-400" :
                      k === "mixed" ? "bg-amber-500/10 text-amber-400" :
                      "bg-white/5 text-muted-foreground"
                    )}>
                      {v} {k}
                    </span>
                  ))}
                </div>
              )}
              {insights && (
                <p className="text-xs text-foreground/80 leading-relaxed">{insights}</p>
              )}
              {!insights && !insightsLoading && (
                <p className="text-[10px] text-muted-foreground/50">No insights available.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* AI Suggestions panel (Discover-style) */}
      {showSuggestions && !usingSamples && deals.length > 0 && (
        <AISuggestionsPanel
          onDealClick={(dealId) => {
            const deal = deals.find((d) => d.id === dealId);
            if (deal) setSelectedDeal(deal);
          }}
          onQuickOutcome={handleQuickOutcome}
        />
      )}

      {/* Advanced filter bar */}
      {showFilters && (
        <PipelineFilterBar
          filters={filters}
          onChange={setFiltersAndSync}
          onClear={() => setFiltersAndSync(EMPTY_FILTERS)}
          assignedProfiles={assignedProfiles}
        />
      )}

      {/* Bulk action bar */}
      {selectedDealIds.size > 0 && (
        <BulkActionBar
          count={selectedDealIds.size}
          stages={activeStages}
          onMove={handleBulkMove}
          onDelete={handleBulkDelete}
          onOutcome={handleBulkOutcome}
          onSelectAll={selectAllVisible}
          onClear={clearSelection}
        />
      )}

      {/* Saved views */}
      <SavedViewsBar
        page="pipeline"
        currentFilters={filters}
        currentBoard={board}
        onApplyView={(f, b) => {
          const newFilters = { ...EMPTY_FILTERS, ...f } as PipelineFilters;
          const newBoard = (b as BoardType) ?? board;
          setFilters(newFilters);
          if (b) setBoard(newBoard);
          syncFiltersToUrl(newFilters, newBoard, search);
        }}
      />

      {usingSamples && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-muted-foreground">
          Showing sample deals. Add your first deal to get started.
        </div>
      )}

      {viewMode === "kanban" ? (
        <KanbanBoard
          stages={activeStages}
          deals={searchFiltered}
          allDeals={deals}
          board={board}
          onMoveDeal={handleMoveDeal}
          onDealClick={setSelectedDeal}
          onQuickMove={handleMoveDeal}
          onQuickOutcome={handleQuickOutcome}
          onInlineEdit={handleInlineEdit}
          selectedDealIds={selectedDealIds}
          onToggleSelect={toggleSelectDeal}
          highlightDealId={highlightDealId}
          highlightedDealIds={highlightedDealIds}
          highlightDetails={highlightDetails}
          unreadCounts={unreadCounts}
          onAutomateDeal={handleAutomateDeal}
        />
      ) : (
        <DealListView
          deals={searchFiltered}
          stages={activeStages}
          board={board}
          onDealClick={setSelectedDeal}
          selectedDealIds={selectedDealIds}
          onToggleSelect={toggleSelectDeal}
          highlightDealId={highlightDealId}
          highlightedDealIds={highlightedDealIds}
        />
      )}

      <CreateDealModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        stages={stages}
        contacts={contacts}
        onCreated={fetchData}
      />

      <DealDetailPanel
        deal={selectedDeal}
        open={!!selectedDeal}
        onClose={() => setSelectedDeal(null)}
        onDeleted={fetchData}
        onUpdated={fetchData}
      />

      <AutomateDealModal
        open={!!automateDeal}
        onClose={() => setAutomateDeal(null)}
        deal={automateDeal}
        templates={workflowTemplates}
        templatesLoading={templatesLoading}
        onWorkflowCreated={fetchData}
      />
    </div>
  );
}
