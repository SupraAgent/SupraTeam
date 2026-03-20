"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Flame, ChevronRight, Zap } from "lucide-react";

type Deal = {
  id: string;
  deal_name: string;
  board_type: string;
  value: number | null;
  stage: { name: string; color: string } | null;
};

type Stats = {
  totalDeals: number;
  staleDeals: { id: string; deal_name: string; days_stale: number }[];
  followUps: { id: string; deal_name: string; hours_since: number }[];
  hotConversations: { name: string; count: number; deal_id: string }[];
};

export default function TMAHomePage() {
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tgUser, setTgUser] = React.useState<{ first_name: string; username?: string } | null>(null);

  React.useEffect(() => {
    // Init Telegram WebApp
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Telegram) {
      const tg = (window as unknown as { Telegram: { WebApp: { ready: () => void; expand: () => void; initDataUnsafe: { user?: { first_name: string; username?: string } } } } }).Telegram.WebApp;
      tg.ready();
      tg.expand();
      if (tg.initDataUnsafe?.user) {
        setTgUser(tg.initDataUnsafe.user);
      }
    }

    // Fetch data
    Promise.all([
      fetch("/api/deals").then((r) => r.json()).catch(() => ({ deals: [] })),
      fetch("/api/stats").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([dealsData, statsData]) => {
      setDeals(dealsData.deals ?? []);
      setStats(statsData ? {
        totalDeals: statsData.totalDeals ?? 0,
        staleDeals: statsData.staleDeals ?? [],
        followUps: statsData.followUps ?? [],
        hotConversations: statsData.hotConversations ?? [],
      } : { totalDeals: 0, staleDeals: [], followUps: [], hotConversations: [] });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-6 w-32 bg-white/5 rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/[0.02] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-lg font-semibold text-foreground">
          {tgUser ? `Hi ${tgUser.first_name}` : "SupraCRM"}
        </h1>
        <p className="text-xs text-muted-foreground">{deals.length} active deals</p>
      </div>

      {/* Urgent section */}
      {stats && (stats.staleDeals.length > 0 || stats.followUps.length > 0 || stats.hotConversations.length > 0) && (
        <div className="px-4 mb-4">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Needs Attention
            </p>
            {stats.staleDeals.slice(0, 2).map((d) => (
              <Link key={d.id} href={`/tma/deals/${d.id}`} className="flex items-center justify-between py-1">
                <span className="text-xs text-foreground">{d.deal_name}</span>
                <span className="text-[10px] text-red-400">{d.days_stale}d stale</span>
              </Link>
            ))}
            {stats.followUps.slice(0, 2).map((d) => (
              <Link key={d.id} href={`/tma/deals/${d.id}`} className="flex items-center justify-between py-1">
                <span className="text-xs text-foreground">{d.deal_name}</span>
                <span className="text-[10px] text-yellow-400">{d.hours_since}h follow-up</span>
              </Link>
            ))}
            {stats.hotConversations.slice(0, 2).map((c, i) => (
              <Link key={i} href={c.deal_id ? `/tma/deals/${c.deal_id}` : "#"} className="flex items-center justify-between py-1">
                <span className="text-xs text-foreground flex items-center gap-1">
                  <Flame className="h-3 w-3 text-orange-400" /> {c.name}
                </span>
                <span className="text-[10px] text-blue-400">{c.count} msgs</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Deals list */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">My Deals</p>
          <Link href="/tma/deals" className="text-[10px] text-primary">View all</Link>
        </div>
        <div className="space-y-1.5">
          {deals.slice(0, 10).map((deal) => (
            <Link
              key={deal.id}
              href={`/tma/deals/${deal.id}`}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 transition active:bg-white/[0.06]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{deal.deal_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {deal.stage && (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: deal.stage.color }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deal.stage.color }} />
                      {deal.stage.name}
                    </span>
                  )}
                  <span className={cn(
                    "text-[10px]",
                    deal.board_type === "BD" ? "text-blue-400" : deal.board_type === "Marketing" ? "text-purple-400" : "text-orange-400"
                  )}>
                    {deal.board_type}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {deal.value != null && deal.value > 0 && (
                  <span className="text-xs text-muted-foreground">${Number(deal.value).toLocaleString()}</span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />
              </div>
            </Link>
          ))}
          {deals.length === 0 && (
            <div className="text-center py-8">
              <Zap className="mx-auto h-6 w-6 text-muted-foreground/20" />
              <p className="mt-2 text-xs text-muted-foreground">No deals yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[hsl(225,35%,5%)] flex items-center justify-around py-2 px-4 safe-area-bottom">
        <Link href="/tma" className="flex flex-col items-center gap-0.5 text-primary">
          <Zap className="h-5 w-5" />
          <span className="text-[10px]">Home</span>
        </Link>
        <Link href="/tma/deals" className="flex flex-col items-center gap-0.5 text-muted-foreground">
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
