"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Lightbulb, ThumbsUp, Sparkles, Filter, Plus, X,
  ArrowUpDown, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";

interface Suggestion {
  id: string;
  title: string;
  description: string;
  submitted_by: string;
  submitted_by_name: string;
  category: string;
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

const CATEGORIES = [
  { value: "ux", label: "UX / UI" },
  { value: "telegram", label: "Telegram" },
  { value: "pipeline", label: "Pipeline" },
  { value: "automation", label: "Automation" },
  { value: "reporting", label: "Reporting" },
  { value: "integration", label: "Integration" },
  { value: "other", label: "Other" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-white/10 text-muted-foreground" },
  evaluating: { label: "Evaluating...", color: "bg-blue-500/20 text-blue-400" },
  approved: { label: "Approved", color: "bg-emerald-500/20 text-emerald-400" },
  deferred: { label: "Deferred", color: "bg-amber-500/20 text-amber-400" },
  rejected: { label: "Rejected", color: "bg-red-500/20 text-red-400" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  p0: { label: "P0 — Do Now", color: "text-red-400" },
  p1: { label: "P1 — Next Sprint", color: "text-amber-400" },
  p2: { label: "P2 — Backlog", color: "text-blue-400" },
  p3: { label: "P3 — Nice to Have", color: "text-muted-foreground" },
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

export default function SuggestionsPage() {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [filterStatus, setFilterStatus] = React.useState("all");
  const [filterCategory, setFilterCategory] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("newest");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [evaluatingIds, setEvaluatingIds] = React.useState<Set<string>>(new Set());

  // Form state
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("other");
  const [submitting, setSubmitting] = React.useState(false);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), category }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Suggestion submitted");
        setTitle("");
        setDescription("");
        setCategory("other");
        setShowForm(false);
        fetchSuggestions();
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

  async function handleEvaluate(id: string) {
    setEvaluatingIds((prev) => new Set([...prev, id]));
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status: "evaluating" } : s)));

    try {
      const res = await fetch("/api/suggestions/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: id }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`CPO scored this ${data.evaluation.score}/100`);
        fetchSuggestions();
        setExpandedId(id);
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
        next.delete(id);
        return next;
      });
    }
  }

  const approvedCount = suggestions.filter((s) => s.status === "approved").length;
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const avgScore = suggestions.filter((s) => s.cpo_score != null).reduce((sum, s, _, arr) => sum + (s.cpo_score ?? 0) / arr.length, 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-400" />
            Feature Suggestions
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Submit ideas. AI CPO evaluates and prioritizes them.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Cancel" : "New Suggestion"}
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Approved</div>
          <div className="text-lg font-semibold text-emerald-400 mt-0.5">{approvedCount}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending Review</div>
          <div className="text-lg font-semibold text-amber-400 mt-0.5">{pendingCount}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Score</div>
          <div className="text-lg font-semibold text-foreground mt-0.5">{avgScore > 0 ? Math.round(avgScore) : "—"}</div>
        </div>
      </div>

      {/* Submit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short, descriptive title..."
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              maxLength={120}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What problem does this solve? Who benefits? How should it work?"
              rows={4}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              maxLength={2000}
              required
            />
            <div className="text-[10px] text-muted-foreground/50 text-right mt-0.5">{description.length}/2000</div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !title.trim() || !description.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
              Submit Suggestion
            </button>
          </div>
        </form>
      )}

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
          <option value="deferred">Deferred</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-foreground focus:outline-none"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <button
          onClick={() => setSortBy(sortBy === "newest" ? "score" : sortBy === "score" ? "upvotes" : "newest")}
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-foreground hover:bg-white/[0.06] transition-colors"
        >
          <ArrowUpDown className="h-3 w-3" />
          {sortBy === "newest" ? "Newest" : sortBy === "score" ? "Top Scored" : "Most Upvoted"}
        </button>
      </div>

      {/* Suggestions list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No suggestions yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s) => {
            const isExpanded = expandedId === s.id;
            const hasVoted = (s.upvoted_by ?? []).includes(user?.id ?? "");
            const statusCfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pending;
            const priorityCfg = s.cpo_priority ? PRIORITY_CONFIG[s.cpo_priority] : null;
            const isEvaluating = evaluatingIds.has(s.id);
            const catLabel = CATEGORIES.find((c) => c.value === s.category)?.label ?? s.category;

            return (
              <div
                key={s.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
              >
                {/* Main row */}
                <div className="flex items-start gap-3 p-3">
                  {/* Upvote */}
                  <button
                    onClick={() => handleUpvote(s.id)}
                    className={cn(
                      "flex flex-col items-center gap-0.5 pt-0.5 min-w-[36px] rounded-lg py-1.5 transition-colors",
                      hasVoted ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ThumbsUp className={cn("h-4 w-4", hasVoted && "fill-current")} />
                    <span className="text-[11px] font-medium">{s.upvotes}</span>
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{s.title}</span>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", statusCfg.color)}>
                        {statusCfg.label}
                      </span>
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
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span>{catLabel}</span>
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
                        onClick={() => handleEvaluate(s.id)}
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
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Description</div>
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap">{s.description}</p>
                    </div>

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

                    {/* Re-evaluate button for already-evaluated suggestions */}
                    {s.cpo_analysis && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleEvaluate(s.id)}
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
