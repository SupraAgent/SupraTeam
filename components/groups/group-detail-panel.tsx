"use client";

import * as React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { cn, timeAgo } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Shield, ShieldOff, Users, MessageCircle, Tag, ExternalLink,
  Activity, TrendingUp, BarChart3, Star, StarOff, RefreshCw, UserCheck,
  UserMinus, UserPlus, AlertTriangle, Loader2, Trash2, Sparkles,
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

type GroupMember = {
  id: string;
  telegram_user_id: number;
  display_name: string | null;
  username: string | null;
  role: string;
  message_count_7d: number;
  message_count_30d: number;
  last_message_at: string | null;
  engagement_tier: string;
  is_flagged: boolean;
  flag_reason: string | null;
  contact: { id: string; name: string; email: string | null; telegram_username: string | null } | null;
};

type MemberSummary = {
  total: number;
  byTier: Record<string, number>;
  flaggedCount: number;
};

type GroupDetailPanelProps = {
  group: TgGroup | null;
  open: boolean;
  onClose: () => void;
};

export function GroupDetailPanel({ group, open, onClose }: GroupDetailPanelProps) {
  const [linkedDeals, setLinkedDeals] = React.useState<LinkedDeal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [members, setMembers] = React.useState<GroupMember[]>([]);
  const [memberSummary, setMemberSummary] = React.useState<MemberSummary | null>(null);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [showMembers, setShowMembers] = React.useState(false);
  const [kickingIds, setKickingIds] = React.useState<Set<number>>(new Set());
  const [confirmAction, setConfirmAction] = React.useState<{ type: "kick" | "nuclear"; member: GroupMember } | null>(null);
  const [nuclearLoading, setNuclearLoading] = React.useState(false);
  const [nuclearConfirmText, setNuclearConfirmText] = React.useState("");
  const [summary, setSummary] = React.useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(false);
  const [summaryMeta, setSummaryMeta] = React.useState<{ message_count: number; from: string; to: string } | null>(null);
  const [customFields, setCustomFields] = React.useState<{ id: string; field_name: string; label: string; field_type: string; options: string[] | null }[]>([]);
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>({});
  const [fieldsSaving, setFieldsSaving] = React.useState(false);

  React.useEffect(() => {
    if (group && open) {
      setLoading(true);
      setShowMembers(false);
      setSummary(null);
      setSummaryMeta(null);
      // Fetch deals and members in parallel
      Promise.all([
        fetch(`/api/deals?tg_group_id=${group.id}`).then((r) => r.json()).catch(() => ({ deals: [] })),
        fetch(`/api/groups/members?group_id=${group.id}`).then((r) => r.json()).catch(() => ({ members: [], summary: null })),
        fetch(`/api/groups/fields?group_id=${group.id}`).then((r) => r.json()).catch(() => ({ fields: [], values: {} })),
      ]).then(([dealsData, membersData, fieldsData]) => {
        setLinkedDeals(dealsData.deals ?? []);
        setMembers(membersData.members ?? []);
        setMemberSummary(membersData.summary ?? null);
        setCustomFields(fieldsData.fields ?? []);
        setFieldValues(fieldsData.values ?? {});
      }).finally(() => setLoading(false));
    }
  }, [group, open]);

  async function syncMembers() {
    if (!group) return;
    setSyncing(true);
    try {
      await fetch("/api/groups/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: group.id }),
      });
      const res = await fetch(`/api/groups/members?group_id=${group.id}`);
      const data = await res.json();
      setMembers(data.members ?? []);
      setMemberSummary(data.summary ?? null);
    } catch {
      toast.error("Failed to sync members");
    } finally {
      setSyncing(false);
    }
  }

  async function toggleFlag(member: GroupMember) {
    try {
      const res = await fetch("/api/groups/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: member.id, is_flagged: !member.is_flagged }),
      });
      if (!res.ok) throw new Error("Failed");
      setMembers((prev) =>
        prev.map((m) => m.id === member.id ? { ...m, is_flagged: !m.is_flagged } : m)
      );
    } catch {
      toast.error("Failed to update flag");
    }
  }

  async function kickMember(member: GroupMember) {
    if (!group) return;
    setKickingIds((prev) => new Set([...prev, member.telegram_user_id]));
    setConfirmAction(null);
    try {
      const res = await fetch("/api/groups/members/kick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: group.id,
          telegram_user_id: member.telegram_user_id,
          member_name: member.display_name ?? member.username ?? "Unknown",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Removed ${member.display_name ?? member.username} from ${group.group_name}`);
        setMembers((prev) => prev.filter((m) => m.telegram_user_id !== member.telegram_user_id));
      } else {
        toast.error(data.error || "Failed to remove member");
      }
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setKickingIds((prev) => {
        const next = new Set(prev);
        next.delete(member.telegram_user_id);
        return next;
      });
    }
  }

  async function saveCustomFields() {
    if (!group) return;
    setFieldsSaving(true);
    try {
      const res = await fetch("/api/groups/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: group.id, values: fieldValues }),
      });
      if (res.ok) toast.success("Custom fields saved");
      else toast.error("Failed to save custom fields");
    } catch {
      toast.error("Failed to save custom fields");
    } finally {
      setFieldsSaving(false);
    }
  }

  async function generateSummary() {
    if (!group) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/summary`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.summary) {
        setSummary(data.summary);
        setSummaryMeta({ message_count: data.message_count, from: data.timespan?.from, to: data.timespan?.to });
      } else {
        toast.error(data.error || "Failed to generate summary");
      }
    } catch {
      toast.error("Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function nuclearRemove(member: GroupMember) {
    setNuclearLoading(true);
    setConfirmAction(null);
    setNuclearConfirmText("");
    try {
      const res = await fetch("/api/groups/members/remove-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_user_id: member.telegram_user_id,
          member_name: member.display_name ?? member.username ?? "Unknown",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Removed from ${data.success} of ${data.total} groups`);
        // Remove from local list
        setMembers((prev) => prev.filter((m) => m.telegram_user_id !== member.telegram_user_id));
      } else {
        toast.error(data.error || "Nuclear remove failed");
      }
    } catch {
      toast.error("Nuclear remove failed");
    } finally {
      setNuclearLoading(false);
    }
  }

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
        {group.group_url && group.group_url.startsWith("https://") && (
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

        {/* AI Summary */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">AI Summary</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2"
              onClick={generateSummary}
              disabled={summaryLoading}
            >
              {summaryLoading ? (
                <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-2.5 w-2.5" />
              )}
              {summaryLoading ? "Summarizing..." : "Summarize"}
            </Button>
          </div>
          {summary && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
              <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed prose-sm"
                dangerouslySetInnerHTML={{ __html: summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }}
              />
              {summaryMeta && (
                <p className="text-[9px] text-muted-foreground pt-1 border-t border-white/5">
                  Based on {summaryMeta.message_count} messages
                  {summaryMeta.from && summaryMeta.to && (
                    <> · {new Date(summaryMeta.from).toLocaleDateString()} — {new Date(summaryMeta.to).toLocaleDateString()}</>
                  )}
                </p>
              )}
            </div>
          )}
          {!summary && !summaryLoading && (
            <p className="text-[10px] text-muted-foreground/50">Click Summarize to get an AI-powered overview of recent conversations.</p>
          )}
        </div>

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

        {/* Custom Fields */}
        {customFields.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">Custom Fields</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2"
                onClick={saveCustomFields}
                disabled={fieldsSaving}
              >
                {fieldsSaving ? <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> : null}
                Save
              </Button>
            </div>
            <div className="space-y-2">
              {customFields.map((field) => (
                <div key={field.id}>
                  <label className="text-[10px] text-muted-foreground">{field.label}</label>
                  {field.field_type === "select" && field.options ? (
                    <select
                      value={fieldValues[field.id] ?? ""}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      className="w-full mt-0.5 h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-foreground"
                    >
                      <option value="">—</option>
                      {(field.options as string[]).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.field_type === "textarea" ? (
                    <textarea
                      value={fieldValues[field.id] ?? ""}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      className="w-full mt-0.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-foreground resize-none"
                      rows={2}
                    />
                  ) : (
                    <input
                      type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : field.field_type === "url" ? "url" : "text"}
                      value={fieldValues[field.id] ?? ""}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      className="w-full mt-0.5 h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-foreground"
                    />
                  )}
                </div>
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

        {/* Member Analytics */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Members {memberSummary ? `(${memberSummary.total} tracked)` : ""}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2"
                onClick={syncMembers}
                disabled={syncing}
              >
                <RefreshCw className={cn("mr-1 h-2.5 w-2.5", syncing && "animate-spin")} />
                {syncing ? "Syncing..." : "Sync"}
              </Button>
              {members.length > 0 && (
                <button
                  onClick={() => setShowMembers(!showMembers)}
                  className="text-xs text-primary hover:underline px-2 py-1 min-h-[36px]"
                >
                  {showMembers ? "Hide" : "Show"}
                </button>
              )}
            </div>
          </div>

          {/* Tier breakdown */}
          {memberSummary && memberSummary.total > 0 && (
            <div className="flex items-center gap-1 flex-wrap mb-2">
              {(["champion", "active", "casual", "lurker", "dormant", "new"] as const).map((tier) => {
                const count = memberSummary.byTier[tier] ?? 0;
                if (count === 0) return null;
                const tierColors: Record<string, string> = {
                  champion: "bg-emerald-500/20 text-emerald-400",
                  active: "bg-blue-500/20 text-blue-400",
                  casual: "bg-purple-500/20 text-purple-400",
                  lurker: "bg-yellow-500/20 text-yellow-400",
                  dormant: "bg-red-500/20 text-red-400",
                  new: "bg-white/10 text-muted-foreground",
                };
                return (
                  <span
                    key={tier}
                    className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-medium capitalize", tierColors[tier])}
                  >
                    {tier} {count}
                  </span>
                );
              })}
              {memberSummary.flaggedCount > 0 && (
                <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/20 text-amber-400">
                  <Star className="inline h-2.5 w-2.5 mr-0.5" />
                  {memberSummary.flaggedCount} flagged
                </span>
              )}
            </div>
          )}

          {/* Member list */}
          {showMembers && (
            <div className="space-y-1 max-h-[350px] overflow-y-auto thin-scroll">
              {members.length > 0 && (
                <p className="text-[10px] text-muted-foreground/50 text-right px-1">
                  Showing {members.length} of {memberSummary?.total ?? members.length}
                </p>
              )}
              {members.map((m) => {
                const tierColors: Record<string, string> = {
                  champion: "text-emerald-400",
                  active: "text-blue-400",
                  casual: "text-purple-400",
                  lurker: "text-yellow-400",
                  dormant: "text-red-400",
                  new: "text-muted-foreground",
                };
                const roleIcons: Record<string, string> = {
                  creator: "bg-amber-500/20 text-amber-400",
                  administrator: "bg-blue-500/20 text-blue-400",
                };
                const isKicking = kickingIds.has(m.telegram_user_id);
                const isProtected = m.role === "creator" || m.role === "administrator";
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-foreground font-medium truncate">
                          {m.display_name ?? m.username ?? `User ${m.telegram_user_id}`}
                        </span>
                        {roleIcons[m.role] && (
                          <span className={cn("rounded px-1 py-0.5 text-[8px] capitalize", roleIcons[m.role])}>
                            {m.role === "creator" ? "owner" : "admin"}
                          </span>
                        )}
                        {m.contact && (
                          <span title={`Linked: ${m.contact.name}`}>
                            <UserCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                        <span className={tierColors[m.engagement_tier] ?? "text-muted-foreground"}>
                          {m.engagement_tier}
                        </span>
                        <span>{m.message_count_7d} msgs/7d</span>
                        {m.username && <span className="font-mono">@{m.username}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => toggleFlag(m)}
                        aria-label={m.is_flagged ? "Unflag member" : "Flag as high-value"}
                        className={cn(
                          "p-2 rounded transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center",
                          m.is_flagged ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground/30 hover:text-amber-400"
                        )}
                      >
                        {m.is_flagged ? <Star className="h-3.5 w-3.5 fill-current" /> : <Star className="h-3.5 w-3.5" />}
                      </button>
                      {group.bot_is_admin && !isProtected && (
                        <button
                          onClick={() => setConfirmAction({ type: "kick", member: m })}
                          disabled={isKicking}
                          aria-label={`Remove ${m.display_name ?? m.username} from this group`}
                          className="p-2 rounded text-muted-foreground/30 hover:text-red-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          {isKicking ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserMinus className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                      {!isProtected && (
                        <button
                          onClick={() => { setConfirmAction({ type: "nuclear", member: m }); setNuclearConfirmText(""); }}
                          aria-label={`Remove ${m.display_name ?? m.username} from all groups`}
                          className="p-2 rounded text-muted-foreground/30 hover:text-red-500 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {members.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 text-center py-2">
                  No members tracked yet. Click Sync to fetch from Telegram.
                </p>
              )}
            </div>
          )}

          {/* Unified confirmation dialog */}
          {confirmAction?.type === "kick" && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-red-400 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Remove {confirmAction.member.display_name ?? confirmAction.member.username} from {group.group_name}?
              </div>
              <p className="text-[11px] text-muted-foreground">They can rejoin via invite link.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => kickMember(confirmAction.member)}
                  className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors min-h-[44px]"
                >
                  Remove
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 rounded-lg bg-white/5 text-muted-foreground text-xs hover:bg-white/10 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {confirmAction?.type === "nuclear" && (() => {
            const memberName = confirmAction.member.display_name ?? confirmAction.member.username ?? "";
            const confirmMatch = nuclearConfirmText.toLowerCase() === memberName.toLowerCase();
            return (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-red-400 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Remove {memberName} from ALL groups?
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This will kick them from every group where the bot is admin. Type their name to confirm.
                </p>
                <input
                  value={nuclearConfirmText}
                  onChange={(e) => setNuclearConfirmText(e.target.value)}
                  placeholder={`Type "${memberName}" to confirm`}
                  className="w-full rounded-lg border border-red-500/20 bg-white/[0.04] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => nuclearRemove(confirmAction.member)}
                    disabled={nuclearLoading || !confirmMatch}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-30 min-h-[44px]"
                  >
                    {nuclearLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                    Remove from All Groups
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-4 py-2 rounded-lg bg-white/5 text-muted-foreground text-xs hover:bg-white/10 transition-colors min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}
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
