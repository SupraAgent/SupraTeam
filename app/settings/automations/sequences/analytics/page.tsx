"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SequenceOverview = {
  id: string;
  name: string;
  stepCount: number;
  isActive: boolean;
  total: number;
  active: number;
  completed: number;
  replied: number;
  bounced: number;
  replyRate: number;
  completionRate: number;
};

type SequenceDetail = {
  sequence: { id: string; name: string; isActive: boolean };
  total: number;
  statusCounts: Record<string, number>;
  replyRate: number;
  completionRate: number;
  stepStats: {
    index: number;
    delayDays: number;
    sent: number;
    reached: number;
  }[];
};

export default function SequenceAnalyticsPage() {
  const [overview, setOverview] = React.useState<SequenceOverview[]>([]);
  const [detail, setDetail] = React.useState<SequenceDetail | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    fetch("/api/email/sequences/analytics")
      .then((r) => r.json())
      .then((json) => setOverview(json.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetch(`/api/email/sequences/analytics?sequence_id=${selectedId}`)
      .then((r) => r.json())
      .then((json) => setDetail(json.data ?? null))
      .finally(() => setLoading(false));
  }, [selectedId]);

  if (loading) {
    return (
      <div className="p-6 text-muted-foreground text-sm">
        Loading analytics...
      </div>
    );
  }

  if (detail && selectedId) {
    return <DetailView detail={detail} onBack={() => setSelectedId(null)} />;
  }

  return <OverviewTable sequences={overview} onSelect={setSelectedId} />;
}

/* ---------- Overview Table ---------- */

function OverviewTable({
  sequences,
  onSelect,
}: {
  sequences: SequenceOverview[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Sequence Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Performance overview across all email sequences.
          </p>
        </div>
        <a
          href="/settings/automations/sequences"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
        >
          Back to Sequences
        </a>
      </div>

      {sequences.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No sequences found. Create a sequence first.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                <th className="px-4 py-3 font-medium">Sequence</th>
                <th className="px-4 py-3 font-medium text-center">Steps</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-center">Enrolled</th>
                <th className="px-4 py-3 font-medium text-center">Active</th>
                <th className="px-4 py-3 font-medium text-center">
                  Reply Rate
                </th>
                <th className="px-4 py-3 font-medium text-center">
                  Completion
                </th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((seq) => (
                <tr
                  key={seq.id}
                  onClick={() => onSelect(seq.id)}
                  className="border-b border-white/5 cursor-pointer hover:bg-white/[0.03] transition"
                >
                  <td className="px-4 py-3 text-foreground font-medium">
                    {seq.name}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {seq.stepCount}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                        seq.isActive
                          ? "bg-green-500/10 text-green-400"
                          : "bg-white/5 text-muted-foreground"
                      )}
                    >
                      {seq.isActive ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {seq.total}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {seq.active}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "font-medium",
                        seq.replyRate >= 30
                          ? "text-green-400"
                          : seq.replyRate >= 15
                            ? "text-yellow-400"
                            : "text-red-400"
                      )}
                    >
                      {seq.replyRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {seq.completionRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- Detail View ---------- */

function DetailView({
  detail,
  onBack,
}: {
  detail: SequenceDetail;
  onBack: () => void;
}) {
  const { sequence, total, statusCounts, replyRate, completionRate, stepStats } =
    detail;

  const statusColors: Record<string, string> = {
    active: "bg-blue-500",
    completed: "bg-green-500",
    replied: "bg-emerald-400",
    bounced: "bg-red-500",
    paused: "bg-white/20",
  };

  const statusLabels: Record<string, string> = {
    active: "Active",
    completed: "Completed",
    replied: "Replied",
    bounced: "Bounced",
    paused: "Paused",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground transition mb-2 flex items-center gap-1"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            All Sequences
          </button>
          <h1 className="text-xl font-semibold text-foreground">
            {sequence.name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                sequence.isActive
                  ? "bg-green-500/10 text-green-400"
                  : "bg-white/5 text-muted-foreground"
              )}
            >
              {sequence.isActive ? "Active" : "Paused"}
            </span>
            <span className="text-xs text-muted-foreground">
              {total} enrolled
            </span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total Enrolled" value={total} />
        <StatCard label="Active" value={statusCounts.active ?? 0} />
        <StatCard
          label="Reply Rate"
          value={`${replyRate}%`}
          highlight={
            replyRate >= 30
              ? "text-green-400"
              : replyRate >= 15
                ? "text-yellow-400"
                : "text-red-400"
          }
        />
        <StatCard label="Completion" value={`${completionRate}%`} />
        <StatCard
          label="Bounced"
          value={statusCounts.bounced ?? 0}
          highlight={
            (statusCounts.bounced ?? 0) > 0 ? "text-red-400" : undefined
          }
        />
      </div>

      {/* Status Breakdown Bar */}
      {total > 0 && (
        <div className="space-y-2">
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Status Breakdown
          </h2>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
            {Object.entries(statusCounts).map(([status, count]) => {
              if (count === 0) return null;
              const pct = (count / total) * 100;
              return (
                <div
                  key={status}
                  className={cn("h-full", statusColors[status])}
                  style={{ width: `${pct}%` }}
                  title={`${statusLabels[status]}: ${count} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div
                  className={cn("h-2 w-2 rounded-full", statusColors[status])}
                />
                <span className="text-[10px] text-muted-foreground">
                  {statusLabels[status]}: {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Step Funnel */}
      {stepStats.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Step Funnel
          </h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                  <th className="px-4 py-3 font-medium">Step</th>
                  <th className="px-4 py-3 font-medium text-center">Delay</th>
                  <th className="px-4 py-3 font-medium text-center">Sent</th>
                  <th className="px-4 py-3 font-medium text-center">
                    Drop-off
                  </th>
                </tr>
              </thead>
              <tbody>
                {stepStats.map((step, i) => {
                  const prevSent = i > 0 ? stepStats[i - 1].sent : total;
                  const dropOff =
                    prevSent > 0
                      ? Math.round(
                          ((prevSent - step.sent) / prevSent) * 100
                        )
                      : 0;

                  return (
                    <tr
                      key={step.index}
                      className="border-b border-white/5"
                    >
                      <td className="px-4 py-3 text-foreground font-medium">
                        Step {step.index + 1}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {step.index === 0 ? "Immediate" : `${step.delayDays}d`}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {step.sent}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {i === 0 ? (
                          <span className="text-muted-foreground/40">--</span>
                        ) : (
                          <span
                            className={cn(
                              dropOff > 50
                                ? "text-red-400"
                                : dropOff > 25
                                  ? "text-yellow-400"
                                  : "text-green-400"
                            )}
                          >
                            -{dropOff}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold text-foreground", highlight)}>
        {value}
      </p>
    </div>
  );
}
