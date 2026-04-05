"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, X, Search, Loader2 } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { SwipeableDealCard } from "@/components/tma/swipeable-deal-card";
import { QuickActionMenu } from "@/components/tma/quick-action-menu";
import { hapticImpact, hapticNotification } from "@/components/tma/haptic";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { toast } from "sonner";
import { useOfflineCache } from "@/lib/client/tma-offline";

interface Deal {
  id: string;
  deal_name: string;
  board_type: string;
  stage_id: string | null;
  value: number | null;
  contact: { name: string } | null;
  stage: { id: string; name: string; color: string; position: number } | null;
}

interface Stage {
  id: string;
  name: string;
  position: number;
  color: string;
  board_type: string | null;
}

interface ContactOption {
  id: string;
  name: string;
}

const BOARD_TYPES = ["All", "BD", "Marketing", "Admin", "Applications"] as const;

export default function TMADealsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedStages, setExpandedStages] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [boardFilter, setBoardFilter] = React.useState<string>("All");
  const [quickAction, setQuickAction] = React.useState<{
    deal: Deal;
    position: { top: number; left: number };
  } | null>(null);

  // Create deal modal state
  const [showCreate, setShowCreate] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    deal_name: "",
    board_type: "BD",
    stage_id: "",
    value: "",
    contact_id: "",
  });
  const [contactSearch, setContactSearch] = React.useState("");
  const [contactOptions, setContactOptions] = React.useState<ContactOption[]>([]);
  const [contactLoading, setContactLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const contactSearchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const stagesRef = React.useRef(stages);
  stagesRef.current = stages;

  useTelegramWebApp();

  // Open create modal if navigated with ?create=1
  React.useEffect(() => {
    if (searchParams.get("create") === "1") {
      setShowCreate(true);
    }
  }, [searchParams]);

  // Contact search debounce
  React.useEffect(() => {
    if (contactSearchTimer.current) clearTimeout(contactSearchTimer.current);
    if (!contactSearch.trim()) {
      setContactOptions([]);
      return;
    }
    contactSearchTimer.current = setTimeout(async () => {
      setContactLoading(true);
      try {
        const res = await fetch(`/api/contacts?q=${encodeURIComponent(contactSearch)}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          setContactOptions((data.contacts ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        }
      } catch {
        // silent
      } finally {
        setContactLoading(false);
      }
    }, 300);
    return () => {
      if (contactSearchTimer.current) clearTimeout(contactSearchTimer.current);
    };
  }, [contactSearch]);

  // Offline cache for deals and pipeline stages
  const dealsCache = useOfflineCache<{ deals: Deal[] }>("/api/deals", { maxAgeMs: 5 * 60_000 });
  const stagesCache = useOfflineCache<{ stages: Stage[] }>("/api/pipeline", { maxAgeMs: 60 * 60_000 });

  // Data fetching with offline fallback
  const fetchData = React.useCallback(async () => {
    try {
      const [dealsRes, stagesRes] = await Promise.all([
        fetch("/api/deals"),
        fetch("/api/pipeline"),
      ]);
      if (!dealsRes.ok || !stagesRes.ok) {
        console.error("[tma/deals] fetch failed:", dealsRes.status, stagesRes.status);
        return;
      }
      const [dealsData, stagesData] = await Promise.all([dealsRes.json(), stagesRes.json()]);
      const newDeals = dealsData.deals ?? [];
      const newStages = stagesData.stages ?? [];
      setDeals(newDeals);
      setStages(newStages);
      // Expand all stages on first load
      setExpandedStages((prev) => prev.size === 0 ? new Set(newStages.map((s: Stage) => s.id)) : prev);
    } catch {
      // Network failed — fall back to offline cache
      if (dealsCache.data) setDeals(dealsCache.data.deals ?? []);
      if (stagesCache.data) {
        const cached = stagesCache.data.stages ?? [];
        setStages(cached);
        setExpandedStages((prev) => prev.size === 0 ? new Set(cached.map((s) => s.id)) : prev);
      }
    }
  }, [dealsCache.data, stagesCache.data]);

  React.useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Pull to refresh handler
  const handleRefresh = React.useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Swipe to change stage
  const handleStageChange = React.useCallback(async (dealId: string, newStageId: string) => {
    // Optimistic update — read stages from ref to avoid stale closure
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== dealId) return d;
        const newStage = stagesRef.current.find((s) => s.id === newStageId);
        return {
          ...d,
          stage_id: newStageId,
          stage: newStage ? { id: newStage.id, name: newStage.name, color: newStage.color, position: newStage.position } : d.stage,
        };
      })
    );

    try {
      const res = await fetch(`/api/deals/${dealId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: newStageId }),
      });

      if (!res.ok) {
        await fetchData();
      }
    } catch {
      await fetchData();
    }
  }, [fetchData]);

  // Long press quick actions
  function handleLongPress(deal: Deal, rect: DOMRect) {
    setQuickAction({ deal, position: { top: rect.top, left: rect.left + rect.width / 2 } });
  }

  async function handleMarkOutcome(dealId: string, outcome: "won" | "lost") {
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    hapticImpact("medium");
    await fetchData();
  }

  function handleAddNote(dealId: string) {
    router.push(`/tma/deals/${dealId}?tab=notes`);
  }

  // Create deal handler
  async function handleCreateDeal() {
    if (!createForm.deal_name.trim()) {
      toast.error("Deal name is required");
      return;
    }
    if (!createForm.stage_id) {
      toast.error("Please select a stage");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_name: createForm.deal_name.trim(),
          board_type: createForm.board_type,
          stage_id: createForm.stage_id,
          value: createForm.value ? Number(createForm.value) : null,
          contact_id: createForm.contact_id || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to create deal" }));
        toast.error(err.error ?? "Failed to create deal");
        return;
      }

      hapticNotification("success");
      toast.success("Deal created");
      setShowCreate(false);
      setCreateForm({ deal_name: "", board_type: "BD", stage_id: "", value: "", contact_id: "" });
      setContactSearch("");
      setContactOptions([]);
      await fetchData();
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  }

  function toggleStage(stageId: string) {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  const filteredDeals = deals.filter((d) => {
    const matchesSearch = !search || d.deal_name.toLowerCase().includes(search.toLowerCase());
    const matchesBoard = boardFilter === "All" || d.board_type === boardFilter;
    return matchesSearch && matchesBoard;
  });

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white/[0.02] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="px-4 pt-4 pb-1 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Pipeline</h1>
          <span className="text-xs text-muted-foreground">{deals.length} deals</span>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals..."
              className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {/* Board type filter tabs */}
        <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
          {BOARD_TYPES.map((bt) => (
            <button
              key={bt}
              onClick={() => { setBoardFilter(bt); hapticImpact("light"); }}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                boardFilter === bt
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-muted-foreground active:bg-white/10"
              )}
            >
              {bt}
            </button>
          ))}
        </div>

        <div className="px-4 space-y-2">
          {stages.map((stage) => {
            const stageDeals = filteredDeals.filter((d) => d.stage_id === stage.id);
            const expanded = expandedStages.has(stage.id);

            return (
              <div key={stage.id} className="rounded-xl border border-white/10 overflow-hidden">
                <button
                  onClick={() => toggleStage(stage.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-white/[0.03] transition active:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-xs font-medium text-foreground">{stage.name}</span>
                    <span className="text-[10px] text-muted-foreground/60">({stageDeals.length})</span>
                  </div>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
                </button>

                {expanded && stageDeals.length > 0 && (
                  <div className="divide-y divide-white/5">
                    {stageDeals.map((deal) => (
                      <SwipeableDealCard
                        key={deal.id}
                        deal={deal}
                        stages={stages}
                        onStageChange={handleStageChange}
                        onLongPress={handleLongPress}
                      />
                    ))}
                  </div>
                )}

                {expanded && stageDeals.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[10px] text-muted-foreground/40">No deals</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PullToRefresh>

      {/* Quick action menu (from long press) */}
      {quickAction && (
        <QuickActionMenu
          dealId={quickAction.deal.id}
          dealName={quickAction.deal.deal_name}
          position={quickAction.position}
          onClose={() => setQuickAction(null)}
          onAddNote={handleAddNote}
          onMarkWon={(id) => handleMarkOutcome(id, "won")}
          onMarkLost={(id) => handleMarkOutcome(id, "lost")}
        />
      )}

      {/* FAB - Create Deal */}
      <button
        onClick={() => { setShowCreate(true); hapticImpact("medium"); }}
        className="fixed right-4 bottom-24 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Create Deal Bottom Sheet */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-[hsl(225,35%,8%)] border-t border-white/10 p-4 pb-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">New Deal</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg active:bg-white/10">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Deal name */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Deal Name *</label>
              <input
                value={createForm.deal_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, deal_name: e.target.value }))}
                placeholder="Enter deal name"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
            </div>

            {/* Board type */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Board</label>
              <div className="flex gap-2">
                {(["BD", "Marketing", "Admin", "Applications"] as const).map((bt) => (
                  <button
                    key={bt}
                    onClick={() => setCreateForm((f) => ({ ...f, board_type: bt, stage_id: "" }))}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-xs font-medium transition",
                      createForm.board_type === bt
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/5 text-muted-foreground active:bg-white/10"
                    )}
                  >
                    {bt}
                  </button>
                ))}
              </div>
            </div>

            {/* Stage */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Stage *</label>
              <div className="flex flex-wrap gap-1.5">
                {stages.filter((s) => {
                  if (createForm.board_type === "Applications") return s.board_type === "Applications";
                  return !s.board_type;
                }).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setCreateForm((f) => ({ ...f, stage_id: s.id }))}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs transition",
                      createForm.stage_id === s.id
                        ? "ring-2 ring-primary bg-white/10 text-foreground"
                        : "bg-white/5 text-muted-foreground active:bg-white/10"
                    )}
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full mr-1.5" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Value */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Value (optional)</label>
              <input
                type="number"
                inputMode="numeric"
                value={createForm.value}
                onChange={(e) => setCreateForm((f) => ({ ...f, value: e.target.value }))}
                placeholder="0"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Contact search */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Contact (optional)</label>
              <input
                value={contactSearch}
                onChange={(e) => {
                  setContactSearch(e.target.value);
                  if (!e.target.value) setCreateForm((f) => ({ ...f, contact_id: "" }));
                }}
                placeholder="Search contacts..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
              {contactLoading && (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                </div>
              )}
              {contactSearch && !contactLoading && contactOptions.length === 0 && !createForm.contact_id && (
                <p className="mt-1 text-[10px] text-muted-foreground/60">No contacts found</p>
              )}
              {contactOptions.length > 0 && (
                <div className="mt-1 rounded-xl border border-white/10 bg-white/5 overflow-hidden max-h-32 overflow-y-auto">
                  {contactOptions.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCreateForm((f) => ({ ...f, contact_id: c.id }));
                        setContactSearch(c.name);
                        setContactOptions([]);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm transition active:bg-white/10",
                        createForm.contact_id === c.id ? "text-primary" : "text-foreground"
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleCreateDeal}
              disabled={creating || !createForm.deal_name.trim() || !createForm.stage_id}
              className={cn(
                "w-full rounded-xl py-3 text-sm font-semibold transition",
                creating || !createForm.deal_name.trim() || !createForm.stage_id
                  ? "bg-white/5 text-muted-foreground"
                  : "bg-primary text-primary-foreground active:opacity-80"
              )}
            >
              {creating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating...
                </span>
              ) : (
                "Create Deal"
              )}
            </button>
          </div>
        </div>
      )}

      <BottomTabBar active="pipeline" />
    </div>
  );
}
