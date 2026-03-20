"use client";

import * as React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { cn, timeAgo } from "@/lib/utils";
import Link from "next/link";
import {
  Shield, ShieldOff, Users, MessageCircle, Tag, ExternalLink,
  Activity, TrendingUp, BarChart3,
} from "lucide-react";

type MessageHistoryEntry = { date: string; count: number };

type TgGroup = {
  id: string;
  telegram_group_id: string;
  group_name: string;
  group_type: string | null;
  group_url: string | null;
  bot_is_admin: boolean;
  member_count: number | null;
  is_archived: boolean;
  last_message_at: string | null;
  message_count_7d: number;
  message_count_30d: number;
  health_status: string;
  created_at: string;
  slugs: string[];
  message_history: MessageHistoryEntry[];
};

type LinkedDeal = {
  id: string;
  deal_name: string;
  board_type: string;
  value: number | null;
  stage: { name: string; color: string } | null;
};

type GroupDetailPanelProps = {
  group: TgGroup | null;
  open: boolean;
  onClose: () => void;
};

export function GroupDetailPanel({ group, open, onClose }: GroupDetailPanelProps) {
  const [linkedDeals, setLinkedDeals] = React.useState<LinkedDeal[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (group && open) {
      setLoading(true);
      // Fetch deals linked to this group's telegram_group_id
      fetch(`/api/deals?tg_group_id=${group.id}`)
        .then((r) => r.json())
        .then((d) => setLinkedDeals(d.deals ?? []))
        .catch(() => setLinkedDeals([]))
        .finally(() => setLoading(false));
    }
  }, [group, open]);

  if (!group) return null;

  // Engagement score: weighted formula
  const engagementScore = React.useMemo(() => {
    let score = 0;
    // Activity recency
    if (group.last_message_at) {
      const daysSince = (Date.now() - new Date(group.last_message_at).getTime()) / 86400000;
      if (daysSince < 1) score += 30;
      else if (daysSince < 3) score += 20;
      else if (daysSince < 7) score += 10;
    }
    // 7d volume
    if (group.message_count_7d >= 50) score += 25;
    else if (group.message_count_7d >= 20) score += 18;
    else if (group.message_count_7d >= 5) score += 10;
    else if (group.message_count_7d >= 1) score += 5;
    // 30d volume
    if (group.message_count_30d >= 200) score += 20;
    else if (group.message_count_30d >= 50) score += 12;
    else if (group.message_count_30d >= 10) score += 5;
    // Members
    if (group.member_count) {
      if (group.member_count >= 100) score += 15;
      else if (group.member_count >= 20) score += 10;
      else if (group.member_count >= 5) score += 5;
    }
    // Consistency (has history data)
    if (group.message_history?.length >= 20) score += 10;
    return Math.min(score, 100);
  }, [group]);

  const healthColors: Record<string, string> = {
    active: "text-emerald-400",
    quiet: "text-yellow-400",
    stale: "text-orange-400",
    dead: "text-red-400",
    unknown: "text-muted-foreground",
  };

  // Weekly trend
  const weeklyTrend = React.useMemo(() => {
    if (!group.message_history || group.message_history.length < 14) return null;
    const recent7 = group.message_history.slice(-7).reduce((s, e) => s + e.count, 0);
    const prev7 = group.message_history.slice(-14, -7).reduce((s, e) => s + e.count, 0);
    if (prev7 === 0) return recent7 > 0 ? 100 : 0;
    return Math.round(((recent7 - prev7) / prev7) * 100);
  }, [group.message_history]);

  return (
    <SlideOver open={open} onClose={onClose} title={group.group_name}>
      <div className="space-y-4">
        {/* Group link */}
        {group.group_url && (
          <a
            href={group.group_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-[#2AABEE] text-white px-4 py-2.5 text-sm font-medium transition hover:bg-[#2AABEE]/90 w-full"
          >
            <MessageCircle className="h-4 w-4" />
            Open in Telegram
          </a>
        )}

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {group.bot_is_admin ? (
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
              <Shield className="h-3 w-3" /> Admin
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
              <ShieldOff className="h-3 w-3" /> Member
            </span>
          )}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", healthColors[group.health_status] ?? "text-muted-foreground")}>
            {group.health_status}
          </span>
          {group.group_type && (
            <span className="rounded-full px-2 py-0.5 text-xs text-muted-foreground bg-white/5">
              {group.group_type}
            </span>
          )}
          {group.is_archived && (
            <span className="rounded-full px-2 py-0.5 text-xs text-red-400 bg-red-500/10">Archived</span>
          )}
        </div>

        {/* Engagement score */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Engagement Score</span>
            <span className={cn(
              "text-sm font-semibold",
              engagementScore >= 60 ? "text-emerald-400" : engagementScore >= 30 ? "text-amber-400" : "text-red-400"
            )}>
              {engagementScore}/100
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                engagementScore >= 60 ? "bg-emerald-400" : engagementScore >= 30 ? "bg-amber-400" : "bg-red-400"
              )}
              style={{ width: `${engagementScore}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-center">
            <Users className="mx-auto h-3.5 w-3.5 text-blue-400" />
            <p className="mt-1 text-sm font-semibold text-foreground">{group.member_count ?? "--"}</p>
            <p className="text-[9px] text-muted-foreground">Members</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-center">
            <Activity className="mx-auto h-3.5 w-3.5 text-purple-400" />
            <p className="mt-1 text-sm font-semibold text-foreground">{group.message_count_7d}</p>
            <p className="text-[9px] text-muted-foreground">Msgs / 7d</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-center">
            <BarChart3 className="mx-auto h-3.5 w-3.5 text-amber-400" />
            <p className="mt-1 text-sm font-semibold text-foreground">{group.message_count_30d}</p>
            <p className="text-[9px] text-muted-foreground">Msgs / 30d</p>
          </div>
        </div>

        {/* Weekly trend */}
        {weeklyTrend !== null && (
          <div className="flex items-center gap-2 text-xs">
            <TrendingUp className={cn("h-3.5 w-3.5", weeklyTrend >= 0 ? "text-emerald-400" : "text-red-400")} />
            <span className={weeklyTrend >= 0 ? "text-emerald-400" : "text-red-400"}>
              {weeklyTrend >= 0 ? "+" : ""}{weeklyTrend}%
            </span>
            <span className="text-muted-foreground">vs last week</span>
          </div>
        )}

        {/* Slugs */}
        {group.slugs.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Slugs</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {group.slugs.map((slug) => (
                <span key={slug} className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Tag className="h-2.5 w-2.5" /> {slug}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Linked deals */}
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
            Linked Deals {!loading && `(${linkedDeals.length})`}
          </p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />)}
            </div>
          ) : linkedDeals.length === 0 ? (
            <p className="text-xs text-muted-foreground/50">No deals linked to this group.</p>
          ) : (
            <div className="space-y-1.5">
              {linkedDeals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/pipeline?highlight=${deal.id}`}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 hover:bg-white/[0.06] transition"
                >
                  <div className="flex items-center gap-2">
                    {deal.stage && (
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: deal.stage.color }} />
                    )}
                    <span className="text-xs text-foreground font-medium">{deal.deal_name}</span>
                    <span className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.5",
                      deal.board_type === "BD" && "bg-blue-500/20 text-blue-400",
                      deal.board_type === "Marketing" && "bg-purple-500/20 text-purple-400",
                      deal.board_type === "Admin" && "bg-orange-500/20 text-orange-400",
                    )}>
                      {deal.board_type}
                    </span>
                  </div>
                  {deal.value != null && deal.value > 0 && (
                    <span className="text-[10px] text-muted-foreground">${Number(deal.value).toLocaleString()}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="space-y-1 pt-2 border-t border-white/10">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Last message</span>
            <span className="text-foreground">{group.last_message_at ? timeAgo(group.last_message_at) : "Never"}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Bot joined</span>
            <span className="text-foreground">{timeAgo(group.created_at)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Telegram ID</span>
            <span className="text-foreground text-[10px] font-mono">{group.telegram_group_id}</span>
          </div>
        </div>
      </div>
    </SlideOver>
  );
}
