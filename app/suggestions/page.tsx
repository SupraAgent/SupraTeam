"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Lightbulb, ThumbsUp, Sparkles, Filter, X,
  ArrowUpDown, Loader2, ChevronDown, ChevronUp,
  MessageSquare, Send, Mail, KanbanSquare, Inbox,
  Users, Building2, Zap, Calendar, Megaphone,
  Target, Settings, Smartphone, LayoutGrid,
  Bug, TrendingUp, Plus, Rocket, CheckCircle2,
} from "lucide-react";

interface Suggestion {
  id: string;
  title: string;
  description: string;
  submitted_by: string;
  submitted_by_name: string;
  category: string;
  suggestion_type: string;
  pain_level: string;
  workaround: string | null;
  close_reason: string | null;
  status: string;
  cpo_score: number | null;
  cpo_analysis: string | null;
  cpo_priority: string | null;
  cpo_impact: string | null;
  cpo_effort: string | null;
  cpo_evaluated_at: string | null;
  upvotes: number;
  upvoted_by: string[];
  created_at: string;
}

// ── Module definitions with colors and icons ──
const MODULES = [
  { value: "platform", label: "Platform", icon: LayoutGrid, color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  { value: "telegram", label: "Telegram", icon: MessageSquare, color: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  { value: "email", label: "Email", icon: Mail, color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  { value: "pipeline", label: "Pipeline", icon: KanbanSquare, color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { value: "inbox", label: "Team Inbox", icon: Inbox, color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { value: "tg_groups", label: "TG Groups", icon: Users, color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  { value: "contacts", label: "Contacts", icon: Users, color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  { value: "companies", label: "Companies", icon: Building2, color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { value: "automation", label: "Automations", icon: Zap, color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  { value: "calendar", label: "Calendar & Tasks", icon: Calendar, color: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  { value: "broadcasts", label: "Broadcasts", icon: Megaphone, color: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  { value: "outreach", label: "Outreach", icon: Target, color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  { value: "settings", label: "Settings", icon: Settings, color: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
  { value: "tma", label: "Mobile (TMA)", icon: Smartphone, color: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
];

const SUGGESTION_TYPES = [
  { value: "bug", label: "Bug Fix", icon: Bug, color: "text-red-400" },
  { value: "improvement", label: "Improvement", icon: TrendingUp, color: "text-amber-400" },
  { value: "feature", label: "New Feature", icon: Plus, color: "text-emerald-400" },
];

const PAIN_LEVELS = [
  { value: "nice_to_have", label: "Nice to have", color: "bg-white/10 text-muted-foreground border-white/10" },
  { value: "slows_me_down", label: "Slows me down", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { value: "blocks_my_work", label: "Blocks my work", color: "bg-red-500/15 text-red-400 border-red-500/30" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-white/10 text-muted-foreground" },
  evaluating: { label: "Evaluating...", color: "bg-blue-500/20 text-blue-400" },
  approved: { label: "Approved", color: "bg-emerald-500/20 text-emerald-400" },
  planned: { label: "Planned", color: "bg-sky-500/20 text-sky-400" },
  shipped: { label: "Shipped", color: "bg-primary/20 text-primary" },
  deferred: { label: "Deferred", color: "bg-amber-500/20 text-amber-400" },
  rejected: { label: "Rejected", color: "bg-red-500/20 text-red-400" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  p0: { label: "P0 — Do Now", color: "text-red-400" },
  p1: { label: "P1 — Next Sprint", color: "text-amber-400" },
  p2: { label: "P2 — Backlog", color: "text-blue-400" },
  p3: { label: "P3 — Nice to Have", color: "text-muted-foreground" },
};

const PAIN_SCORE: Record<string, number> = {
  blocks_my_work: 3,
  slows_me_down: 2,
  nice_to_have: 1,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getModuleConfig(value: string) {
  return MODULES.find((m) => m.value === value) ?? MODULES[0];
}

export default function SuggestionsPage() {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [formExpanded, setFormExpanded] = React.useState(false);
  const [filterStatus, setFilterStatus] = React.useState("all");
  const [filterCategory, setFilterCategory] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("impact");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [evaluatingIds, setEvaluatingIds] = React.useState<Set<string>>(new Set());

  // Form state
  const [module, setModule] = React.useState("");
  const [suggestionType, setSuggestionType] = React.useState("improvement");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [workaround, setWorkaround] = React.useState("");
  const [painLevel, setPainLevel] = React.useState("nice_to_have");
  const [submitting, setSubmitting] = React.useState(false);

  const formRef = React.useRef<HTMLFormElement>(null);

  const fetchSuggestions = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterCategory !== "all") params.set("category", filterCategory);
      params.set("sort", sortBy);

      const res = await fetch(`/api/suggestions?${params}`);
      const data = await res.json();
      if (data.suggestions) setSuggestions(data.suggestions);
    } catch {
      console.error("[suggestions] fetch error");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCategory, sortBy]);

  React.useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  // Sort client-side for impact sort (pain * upvotes)
  const sortedSuggestions = React.useMemo(() => {
    if (sortBy !== "impact") return suggestions;
    return [...suggestions].sort((a, b) => {
      const scoreA = (PAIN_SCORE[a.pain_level] ?? 1) * Math.max(a.upvotes, 1);
      const scoreB = (PAIN_SCORE[b.pain_level] ?? 1) * Math.max(b.upvotes, 1);
      return scoreB - scoreA;
    });
  }, [suggestions, sortBy]);

  async function triggerEvaluation(suggestionId: string) {
    setEvaluatingIds((prev) => new Set([...prev, suggestionId]));
    setSuggestions((prev) =>
      prev.map((s) => (s.id === suggestionId ? { ...s, status: "evaluating" } : s))
    );

    try {
      const res = await fetch("/api/suggestions/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: suggestionId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`CPO scored this ${data.evaluation.score}/100`);
        fetchSuggestions();
        setExpandedId(suggestionId);
      } else {
        toast.error(data.error || "Evaluation failed");
        fetchSuggestions();
      }
    } catch {
      toast.error("Evaluation failed");
      fetchSuggestions();
    } finally {
      setEvaluatingIds((prev) => {
        const next = new Set(prev);
        next.delete(suggestionId);
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!module || !title.trim() || !description.trim()) {
      toast.error("Please select a module, add a title, and describe what you're trying to do");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          workaround: workaround.trim() || null,
          category: module,
          suggestion_type: suggestionType,
          pain_level: painLevel,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Suggestion submitted — CPO is evaluating...");
        // Reset form
        setTitle("");
        setDescription("");
        setWorkaround("");
        setModule("");
        setSuggestionType("improvement");
        setPainLevel("nice_to_have");
        setFormExpanded(false);
        fetchSuggestions();
        // Auto-evaluate
        if (data.suggestion?.id) {
          triggerEvaluation(data.suggestion.id);
        }
      } else {
        toast.error(data.error || "Failed to submit");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpvote(id: string) {
    try {
      const res = await fetch("/api/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "upvote" }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  upvotes: data.upvotes,
                  upvoted_by: data.voted
                    ? [...(s.upvoted_by ?? []), user?.id ?? ""]
                    : (s.upvoted_by ?? []).filter((uid) => uid !== user?.id),
                }
              : s
          )
        );
      }
    } catch {
      toast.error("Failed to upvote");
    }
  }

  const approvedCount = suggestions.filter((s) => ["approved", "planned", "shipped"].includes(s.status)).length;
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const shippedCount = suggestions.filter((s) => s.status === "shipped").length;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-400" />
          Feature Suggestions
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Submit ideas. AI CPO evaluates and prioritizes them instantly.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Approved</div>
          <div className="text-lg font-semibold text-emerald-400 mt-0.5">{approvedCount}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</div>
          <div className="text-lg font-semibold text-amber-400 mt-0.5">{pendingCount}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Shipped</div>
          <div className="text-lg font-semibold text-primary mt-0.5 flex items-center gap-1.5">
            {shippedCount}
            {shippedCount > 0 && <Rocket className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {/* ── Always-visible submit form ── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        {!formExpanded ? (
          /* Collapsed: single-line prompt */
          <button
            type="button"
            onClick={() => setFormExpanded(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
          >
            <Lightbulb className="h-4 w-4 text-amber-400/60 shrink-0" />
            <span className="text-sm text-muted-foreground/60">
              I wish I could...
            </span>
          </button>
        ) : (
          /* Expanded form */
          <form ref={formRef} onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Step 1: Module selector pills */}
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">
                Which area?
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MODULES.map((m) => {
                  const Icon = m.icon;
                  const isSelected = module === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setModule(m.value)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        isSelected
                          ? m.color
                          : "bg-white/[0.03] text-muted-foreground border-white/10 hover:bg-white/[0.06] hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Suggestion type toggle */}
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">
                What kind?
              </label>
              <div className="flex gap-2">
                {SUGGESTION_TYPES.map((t) => {
                  const Icon = t.icon;
                  const isSelected = suggestionType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSuggestionType(t.value)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all",
                        isSelected
                          ? "bg-white/10 text-foreground border-white/20"
                          : "bg-white/[0.03] text-muted-foreground border-white/10 hover:bg-white/[0.06]"
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", isSelected && t.color)} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Title — "I wish I could..." */}
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                I wish I could...
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="...bulk-move deals, filter by last message, export contacts as CSV"
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                maxLength={100}
                autoFocus
                required
              />
            </div>

            {/* Step 4: What are you trying to do? */}
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                What are you trying to do?
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the goal or workflow..."
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                maxLength={500}
                required
              />
              {description.length > 400 && (
                <div className="text-[10px] text-muted-foreground/50 text-right mt-0.5">
                  {description.length}/500
                </div>
              )}
            </div>

            {/* Step 5: Workaround (optional) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                What do you do today instead?{" "}
                <span className="text-muted-foreground/50">(optional)</span>
              </label>
              <textarea
                value={workaround}
                onChange={(e) => setWorkaround(e.target.value)}
                placeholder="Current workaround, if any..."
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                maxLength={300}
              />
            </div>

            {/* Step 6: Pain level */}
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">
                How much does this affect you?
              </label>
              <div className="flex gap-2">
                {PAIN_LEVELS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPainLevel(p.value)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-xs font-medium border transition-all",
                      painLevel === p.value
                        ? p.color
                        : "bg-white/[0.03] text-muted-foreground border-white/10 hover:bg-white/[0.06]"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setFormExpanded(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !module || !title.trim() || !description.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[40px]"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Submit & Evaluate
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-foreground focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="planned">Planned</option>
          <option value="shipped">Shipped</option>
          <option value="deferred">Deferred</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-foreground focus:outline-none"
        >
          <option value="all">All Modules</option>
          {MODULES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <button
          onClick={() =>
            setSortBy(
              sortBy === "impact" ? "newest" : sortBy === "newest" ? "score" : sortBy === "score" ? "upvotes" : "impact"
            )
          }
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-foreground hover:bg-white/[0.06] transition-colors"
        >
          <ArrowUpDown className="h-3 w-3" />
          {sortBy === "impact"
            ? "Most Impactful"
            : sortBy === "newest"
            ? "Newest"
            : sortBy === "score"
            ? "Top Scored"
            : "Most Upvoted"}
        </button>
      </div>

      {/* Suggestions list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sortedSuggestions.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No suggestions yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedSuggestions.map((s) => {
            const isExpanded = expandedId === s.id;
            const hasVoted = (s.upvoted_by ?? []).includes(user?.id ?? "");
            const statusCfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pending;
            const priorityCfg = s.cpo_priority ? PRIORITY_CONFIG[s.cpo_priority] : null;
            const isEvaluating = evaluatingIds.has(s.id);
            const moduleCfg = getModuleConfig(s.category);
            const ModuleIcon = moduleCfg.icon;
            const typeCfg = SUGGESTION_TYPES.find((t) => t.value === s.suggestion_type);
            const TypeIcon = typeCfg?.icon ?? TrendingUp;
            const painCfg = PAIN_LEVELS.find((p) => p.value === s.pain_level);

            return (
              <div
                key={s.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
              >
                {/* Main row */}
                <div className="flex items-start gap-3 p-3">
                  {/* Upvote — shows voter names on hover */}
                  <div className="relative group">
                    <button
                      onClick={() => handleUpvote(s.id)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 pt-0.5 min-w-[36px] rounded-lg py-1.5 transition-colors",
                        hasVoted ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                      title={hasVoted ? "Remove +1" : "+1 me too"}
                    >
                      <ThumbsUp className={cn("h-4 w-4", hasVoted && "fill-current")} />
                      <span className="text-[11px] font-medium">{s.upvotes}</span>
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Module chip */}
                      <span className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border", moduleCfg.color)}>
                        <ModuleIcon className="h-2.5 w-2.5" />
                        {moduleCfg.label}
                      </span>
                      {/* Type icon */}
                      <TypeIcon className={cn("h-3 w-3", typeCfg?.color ?? "text-muted-foreground")} />
                      {/* Title */}
                      <span className="text-sm font-medium text-foreground">
                        {s.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                      {/* Status badge */}
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", statusCfg.color)}>
                        {s.status === "shipped" && <CheckCircle2 className="h-2.5 w-2.5 inline mr-0.5" />}
                        {statusCfg.label}
                      </span>
                      {/* Score */}
                      {s.cpo_score != null && (
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                          s.cpo_score >= 70 ? "bg-emerald-500/20 text-emerald-400" :
                          s.cpo_score >= 40 ? "bg-amber-500/20 text-amber-400" :
                          "bg-red-500/20 text-red-400"
                        )}>
                          {s.cpo_score}/100
                        </span>
                      )}
                      {/* Pain level */}
                      {painCfg && s.pain_level !== "nice_to_have" && (
                        <>
                          <span>&middot;</span>
                          <span className={cn(
                            "text-[10px]",
                            s.pain_level === "blocks_my_work" ? "text-red-400" : "text-amber-400"
                          )}>
                            {painCfg.label}
                          </span>
                        </>
                      )}
                      <span>&middot;</span>
                      <span>{s.submitted_by_name}</span>
                      <span>&middot;</span>
                      <span>{timeAgo(s.created_at)}</span>
                      {priorityCfg && (
                        <>
                          <span>&middot;</span>
                          <span className={priorityCfg.color}>{priorityCfg.label}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {s.status === "pending" && (
                      <button
                        onClick={() => triggerEvaluation(s.id)}
                        disabled={isEvaluating}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/20 text-violet-400 text-[11px] font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-50 min-h-[36px]"
                      >
                        {isEvaluating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {isEvaluating ? "Evaluating..." : "Ask CPO"}
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-muted-foreground"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-white/10 px-3 py-3 space-y-3 bg-white/[0.01]">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                        What they&apos;re trying to do
                      </div>
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap">{s.description}</p>
                    </div>

                    {s.workaround && (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                          Current workaround
                        </div>
                        <p className="text-xs text-foreground/60 whitespace-pre-wrap">{s.workaround}</p>
                      </div>
                    )}

                    {/* Close reason (shown when shipped/rejected/deferred with a reason) */}
                    {s.close_reason && (
                      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                          {s.status === "shipped" ? "Shipped" : s.status === "rejected" ? "Declined" : "Status note"}
                        </div>
                        <p className="text-xs text-foreground/70">{s.close_reason}</p>
                      </div>
                    )}

                    {s.cpo_analysis && (
                      <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                          <span className="text-[10px] text-violet-400 uppercase tracking-wider font-medium">CPO Analysis</span>
                        </div>
                        <p className="text-xs text-foreground/80">{s.cpo_analysis}</p>
                        <div className="flex items-center gap-4 mt-2 text-[11px]">
                          {s.cpo_impact && (
                            <span className="text-muted-foreground">
                              Impact: <span className="text-foreground font-medium capitalize">{s.cpo_impact}</span>
                            </span>
                          )}
                          {s.cpo_effort && (
                            <span className="text-muted-foreground">
                              Effort: <span className="text-foreground font-medium capitalize">{s.cpo_effort}</span>
                            </span>
                          )}
                          {s.cpo_evaluated_at && (
                            <span className="text-muted-foreground/50">
                              Evaluated {timeAgo(s.cpo_evaluated_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Re-evaluate button */}
                    {s.cpo_analysis && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => triggerEvaluation(s.id)}
                          disabled={isEvaluating}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                        >
                          <Sparkles className="h-3 w-3" />
                          Re-evaluate
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
