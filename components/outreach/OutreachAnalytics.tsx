"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { FlaskConical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SequenceAnalytics, SequenceDetail, AIRecommendations } from "./types";

interface OutreachAnalyticsProps {
  analyticsData: SequenceAnalytics[] | null;
  analyticsLoading: boolean;
}

export function OutreachAnalytics({ analyticsData, analyticsLoading }: OutreachAnalyticsProps) {
  const [selectedSeqId, setSelectedSeqId] = React.useState<string | null>(null);
  const [detailData, setDetailData] = React.useState<SequenceDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [aiRecs, setAiRecs] = React.useState<AIRecommendations | null>(null);
  const [aiRecsLoading, setAiRecsLoading] = React.useState(false);

  async function fetchSequenceDetail(seqId: string) {
    setSelectedSeqId(seqId);
    setDetailLoading(true);
    setAiRecs(null);
    try {
      const res = await fetch(`/api/outreach/analytics?sequence_id=${seqId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function fetchAIRecommendations(seqId: string) {
    setAiRecsLoading(true);
    try {
      const res = await fetch("/api/outreach/ai-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence_id: seqId }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiRecs(data.recommendations ?? null);
      } else {
        toast.error("Failed to get AI recommendations");
      }
    } finally {
      setAiRecsLoading(false);
    }
  }

  if (analyticsLoading || !analyticsData) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-white/[0.02] animate-pulse" />)}
      </div>
    );
  }

  if (selectedSeqId && detailData) {
    return (
      <SequenceDetailView
        detailData={detailData}
        detailLoading={detailLoading}
        aiRecs={aiRecs}
        aiRecsLoading={aiRecsLoading}
        selectedSeqId={selectedSeqId}
        onBack={() => { setSelectedSeqId(null); setDetailData(null); setAiRecs(null); }}
        onFetchAIRecs={fetchAIRecommendations}
      />
    );
  }

  // Overview: all sequences analytics
  return (
    <div className="space-y-3">
      {analyticsData.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No sequence data yet.</p>
      ) : (
        <>
          {/* Aggregate cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(() => {
              const totals = analyticsData.reduce((acc, s) => {
                acc.total += s.total; acc.replied += s.replied; acc.completed += s.completed; acc.active += s.active;
                return acc;
              }, { total: 0, replied: 0, completed: 0, active: 0 });
              const rr = totals.total > 0 ? Math.round((totals.replied / totals.total) * 100) : 0;
              const cr = totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0;
              return [
                { label: "Total Enrolled", value: totals.total, color: "text-foreground" },
                { label: "In Progress", value: totals.active, color: "text-blue-400" },
                { label: "Avg Reply Rate", value: `${rr}%`, color: rr >= 20 ? "text-emerald-400" : "text-amber-400" },
                { label: "Avg Completion", value: `${cr}%`, color: "text-muted-foreground" },
              ];
            })().map((c) => (
              <div key={c.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
                <p className={cn("text-xl font-semibold mt-0.5", c.color)}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Per-sequence table */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-3">Sequence</th>
                  <th className="text-center p-3">Steps</th>
                  <th className="text-center p-3">Enrolled</th>
                  <th className="text-center p-3">Active</th>
                  <th className="text-center p-3">Replied</th>
                  <th className="text-center p-3">Reply Rate</th>
                  <th className="text-center p-3">Completion</th>
                  <th className="text-center p-3"></th>
                </tr>
              </thead>
              <tbody>
                {analyticsData.map((seq) => (
                  <tr key={seq.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">{seq.name}</span>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] capitalize",
                          seq.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                          seq.status === "paused" ? "bg-yellow-500/10 text-yellow-400" :
                          "bg-white/10 text-muted-foreground"
                        )}>{seq.status}</span>
                      </div>
                    </td>
                    <td className="text-center p-3 text-muted-foreground">{seq.step_count}</td>
                    <td className="text-center p-3 text-foreground font-medium">{seq.total}</td>
                    <td className="text-center p-3 text-blue-400">{seq.active}</td>
                    <td className="text-center p-3 text-purple-400">{seq.replied}</td>
                    <td className="text-center p-3">
                      <span className={cn("font-medium", seq.reply_rate >= 20 ? "text-emerald-400" : seq.reply_rate >= 10 ? "text-amber-400" : "text-muted-foreground")}>
                        {seq.reply_rate}%
                      </span>
                    </td>
                    <td className="text-center p-3 text-muted-foreground">{seq.completion_rate}%</td>
                    <td className="text-center p-3">
                      <button
                        onClick={() => fetchSequenceDetail(seq.id)}
                        className="text-primary hover:underline text-[10px]"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Detail View ──

interface SequenceDetailViewProps {
  detailData: SequenceDetail;
  detailLoading: boolean;
  aiRecs: AIRecommendations | null;
  aiRecsLoading: boolean;
  selectedSeqId: string;
  onBack: () => void;
  onFetchAIRecs: (seqId: string) => void;
}

function SequenceDetailView({
  detailData,
  detailLoading,
  aiRecs,
  aiRecsLoading,
  selectedSeqId,
  onBack,
  onFetchAIRecs,
}: SequenceDetailViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-primary hover:underline">&larr; Back to overview</button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onFetchAIRecs(selectedSeqId)}
          disabled={aiRecsLoading}
          className="text-purple-400 hover:text-purple-300"
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {aiRecsLoading ? "Analyzing..." : "AI Recommendations"}
        </Button>
      </div>

      {detailLoading ? (
        <div className="h-40 rounded-xl bg-white/[0.02] animate-pulse" />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-foreground">{detailData.sequence?.name ?? "Sequence"}</h3>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] capitalize">{detailData.sequence?.status}</span>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Enrolled", value: detailData.total, color: "text-foreground" },
              { label: "Replied", value: detailData.replied, color: "text-purple-400" },
              { label: "Reply Rate", value: `${detailData.reply_rate}%`, color: detailData.reply_rate >= 20 ? "text-emerald-400" : "text-amber-400" },
              { label: "Completion", value: `${detailData.completion_rate}%`, color: "text-blue-400" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
                <p className={cn("text-xl font-semibold mt-0.5", c.color)}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          {Object.keys(detailData.status_counts).length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Enrollment Status</h4>
              <div className="flex items-center gap-3 flex-wrap">
                {Object.entries(detailData.status_counts).map(([status, count]) => (
                  <span key={status} className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs">
                    <span className="text-foreground font-medium capitalize">{status}</span>
                    <span className="text-muted-foreground ml-1.5">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* A/B Test Results */}
          {detailData.ab_stats && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-3.5 w-3.5 text-purple-400" />
                <h4 className="text-xs font-medium text-purple-400">A/B{detailData.ab_stats.variant_c ? "/C" : ""} Test Results</h4>
              </div>
              <div className={cn("grid gap-3", detailData.ab_stats.variant_c ? "grid-cols-3" : "grid-cols-2")}>
                {(["variant_a", "variant_b", ...(detailData.ab_stats.variant_c ? ["variant_c" as const] : [])] as const).map((variant) => {
                  const data = (detailData.ab_stats as unknown as Record<string, { total: number; replied: number; reply_rate: number }>)[variant];
                  if (!data) return null;
                  const allRates = [
                    detailData.ab_stats!.variant_a.reply_rate,
                    detailData.ab_stats!.variant_b.reply_rate,
                    ...(detailData.ab_stats!.variant_c ? [detailData.ab_stats!.variant_c.reply_rate] : []),
                  ];
                  const maxRate = Math.max(...allRates);
                  const hasVariation = new Set(allRates).size > 1;
                  const isWinner = hasVariation && data.reply_rate >= maxRate;
                  return (
                    <div key={variant} className={cn(
                      "rounded-lg border p-3 space-y-1",
                      isWinner ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">
                          Variant {variant === "variant_a" ? "A" : variant === "variant_b" ? "B" : "C"}
                        </span>
                        {isWinner && data.total > 0 && (
                          <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-400 font-medium">Winner</span>
                        )}
                      </div>
                      <p className="text-lg font-semibold text-foreground">{data.reply_rate}%</p>
                      <p className="text-[10px] text-muted-foreground">
                        {data.replied}/{data.total} replied
                      </p>
                    </div>
                  );
                })}
              </div>
              {detailData.ab_stats.significance ? (
                <div className="text-[10px] px-1">
                  {detailData.ab_stats.significance.min_sample ? (
                    <p className="text-muted-foreground/60">Need 30+ per variant for reliable results</p>
                  ) : detailData.ab_stats.significance.significant ? (
                    <p className="text-emerald-400">Statistically significant (95% confidence, z={detailData.ab_stats.significance.z_score})</p>
                  ) : (
                    <p className="text-amber-400">Not yet significant — keep testing (z={detailData.ab_stats.significance.z_score})</p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/40 px-1">Need 5+ per variant for significance testing</p>
              )}
            </div>
          )}

          {/* Step funnel */}
          {detailData.step_stats.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">Step Funnel</h4>
              <div className="space-y-2">
                {detailData.step_stats.map((step, i) => {
                  const maxSent = Math.max(...detailData.step_stats.map((s) => s.sent), 1);
                  const pct = (step.sent / maxSent) * 100;
                  const dropoff = i > 0 && detailData.step_stats[i - 1].sent > 0
                    ? Math.round(((detailData.step_stats[i - 1].sent - step.sent) / detailData.step_stats[i - 1].sent) * 100)
                    : 0;
                  return (
                    <div key={step.step_number} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">{step.step_number}</span>
                          <span className="text-xs text-foreground">{step.step_label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{step.sent} sent</span>
                          {dropoff > 0 && <span className="text-[10px] text-red-400">-{dropoff}%</span>}
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 truncate">{step.preview}</p>
                      {step.ab && (
                        <div className="flex items-center gap-3 text-[10px] mt-0.5">
                          <span className={cn(
                            "font-medium",
                            step.ab.a_reply_rate >= step.ab.b_reply_rate ? "text-emerald-400" : "text-muted-foreground"
                          )}>
                            A: {step.ab.a_sent} sent ({step.ab.a_reply_rate}%)
                          </span>
                          <span className="text-muted-foreground/30">|</span>
                          <span className={cn(
                            "font-medium",
                            step.ab.b_reply_rate > step.ab.a_reply_rate ? "text-emerald-400" : "text-muted-foreground"
                          )}>
                            B: {step.ab.b_sent} sent ({step.ab.b_reply_rate}%)
                          </span>
                          {step.ab.c_sent != null && (
                            <>
                              <span className="text-muted-foreground/30">|</span>
                              <span className={cn(
                                "font-medium",
                                (step.ab.c_reply_rate ?? 0) > Math.max(step.ab.a_reply_rate, step.ab.b_reply_rate) ? "text-emerald-400" : "text-muted-foreground"
                              )}>
                                C: {step.ab.c_sent} sent ({step.ab.c_reply_rate ?? 0}%)
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily enrollment chart */}
          {detailData.daily_enrollments.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">Daily Enrollments (30d)</h4>
              <div className="flex items-end gap-0.5 h-16">
                {detailData.daily_enrollments.map((d) => {
                  const max = Math.max(...detailData.daily_enrollments.map((v) => v.count));
                  const height = max > 0 ? (d.count / max) * 100 : 0;
                  return (
                    <div
                      key={d.date}
                      className="flex-1 bg-primary/40 rounded-t hover:bg-primary/60 transition-colors"
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${d.date}: ${d.count}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>{detailData.daily_enrollments[0]?.date}</span>
                <span>{detailData.daily_enrollments[detailData.daily_enrollments.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* AI Recommendations */}
          {aiRecs && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                <h4 className="text-xs font-medium text-purple-400">AI Recommendations</h4>
              </div>
              <p className="text-xs text-foreground">{aiRecs.summary}</p>

              {aiRecs.ab_winner && (
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                  <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs text-foreground">
                    A/B Winner: <span className="font-medium text-emerald-400">Variant {aiRecs.ab_winner}</span>
                  </span>
                  {aiRecs.ab_confidence && (
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                      aiRecs.ab_confidence === "high" ? "bg-emerald-500/20 text-emerald-400" :
                      aiRecs.ab_confidence === "medium" ? "bg-amber-500/20 text-amber-400" :
                      "bg-slate-500/20 text-slate-400"
                    )}>
                      {aiRecs.ab_confidence} confidence
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {aiRecs.recommendations.map((rec, i) => {
                  const typeColors: Record<string, string> = {
                    message: "text-blue-400 bg-blue-500/10",
                    timing: "text-amber-400 bg-amber-500/10",
                    ab_test: "text-purple-400 bg-purple-500/10",
                    structure: "text-cyan-400 bg-cyan-500/10",
                    quick_win: "text-emerald-400 bg-emerald-500/10",
                  };
                  return (
                    <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize", typeColors[rec.type] ?? "text-muted-foreground bg-white/5")}>
                          {rec.type.replace("_", " ")}
                        </span>
                        {rec.step && <span className="text-[9px] text-muted-foreground">Step {rec.step}</span>}
                        <span className="text-xs font-medium text-foreground">{rec.title}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{rec.detail}</p>
                      {rec.suggested_change && (
                        <div className="rounded bg-white/[0.03] px-2 py-1.5 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap">
                          {rec.suggested_change}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
