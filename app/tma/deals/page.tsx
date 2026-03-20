"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, Zap } from "lucide-react";

type Deal = {
  id: string;
  deal_name: string;
  board_type: string;
  stage_id: string | null;
  value: number | null;
  contact: { name: string } | null;
  stage: { id: string; name: string; color: string; position: number } | null;
};

type Stage = { id: string; name: string; position: number; color: string };

export default function TMADealsPage() {
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedStages, setExpandedStages] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Telegram) {
      const tg = (window as unknown as { Telegram: { WebApp: { ready: () => void; expand: () => void } } }).Telegram.WebApp;
      tg.ready();
      tg.expand();
    }

    Promise.all([
      fetch("/api/deals").then((r) => r.json()),
      fetch("/api/pipeline").then((r) => r.json()),
    ]).then(([dealsData, stagesData]) => {
      setDeals(dealsData.deals ?? []);
      const s = stagesData.stages ?? [];
      setStages(s);
      setExpandedStages(new Set(s.map((st: Stage) => st.id)));
    }).finally(() => setLoading(false));
  }, []);

  function toggleStage(stageId: string) {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white/[0.02] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  const [search, setSearch] = React.useState("");
  const filteredDeals = search
    ? deals.filter((d) => d.deal_name.toLowerCase().includes(search.toLowerCase()))
    : deals;

  return (
    <div className="pb-20">
      <div className="px-4 pt-4 pb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Pipeline</h1>
        <span className="text-xs text-muted-foreground">{deals.length} deals</span>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search deals..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
        />
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
                    <Link
                      key={deal.id}
                      href={`/tma/deals/${deal.id}`}
                      className="flex items-center justify-between px-3 py-2.5 transition active:bg-white/[0.04]"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{deal.deal_name}</p>
                        {deal.contact && (
                          <p className="text-[10px] text-muted-foreground">{deal.contact.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px]",
                          deal.board_type === "BD" ? "text-blue-400" : deal.board_type === "Marketing" ? "text-purple-400" : "text-orange-400"
                        )}>
                          {deal.board_type}
                        </span>
                        {deal.value != null && deal.value > 0 && (
                          <span className="text-[10px] text-muted-foreground">${Number(deal.value).toLocaleString()}</span>
                        )}
                        <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                      </div>
                    </Link>
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

      {/* Bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[hsl(225,35%,5%)] flex items-center justify-around py-2 px-4 safe-area-bottom">
        <Link href="/tma" className="flex flex-col items-center gap-0.5 text-muted-foreground">
          <Zap className="h-5 w-5" />
          <span className="text-[10px]">Home</span>
        </Link>
        <Link href="/tma/deals" className="flex flex-col items-center gap-0.5 text-primary">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>
          <span className="text-[10px]">Pipeline</span>
        </Link>
        <Link href="/tma/contacts" className="flex flex-col items-center gap-0.5 text-muted-foreground">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span className="text-[10px]">Contacts</span>
        </Link>
      </div>
    </div>
  );
}
