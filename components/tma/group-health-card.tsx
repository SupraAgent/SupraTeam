"use client";

import * as React from "react";
import { Users, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticImpact } from "@/components/tma/haptic";

interface MessageHistoryEntry {
  date: string;
  count: number;
}

type HealthStatus = "active" | "quiet" | "stale" | "dead" | "unknown";

interface GroupHealthCardProps {
  id: string;
  name: string;
  healthStatus: HealthStatus;
  memberCount: number | null;
  messageCount7d: number;
  messageHistory: MessageHistoryEntry[];
  slugs: string[];
  engagementScore?: number | null;
  onTap: (id: string) => void;
}

const HEALTH_DOT_COLOR: Record<HealthStatus, string> = {
  active: "bg-emerald-400",
  quiet: "bg-yellow-400",
  stale: "bg-orange-400",
  dead: "bg-red-400",
  unknown: "bg-gray-500",
};

const SPARKLINE_STROKE: Record<HealthStatus, string> = {
  active: "#34d399",
  quiet: "#facc15",
  stale: "#fb923c",
  dead: "#f87171",
  unknown: "#6b7280",
};

function MiniSparkline({
  data,
  healthStatus,
}: {
  data: MessageHistoryEntry[];
  healthStatus: HealthStatus;
}) {
  if (!data || data.length === 0) return null;

  const width = 60;
  const height = 20;
  const padding = 1;
  const counts = data.map((d) => d.count);
  const maxCount = Math.max(...counts, 1);
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = counts.map((c, i) => {
    const x = padding + (i / Math.max(counts.length - 1, 1)) * innerW;
    const y = padding + innerH - (c / maxCount) * innerH;
    return `${x},${y}`;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={SPARKLINE_STROKE[healthStatus]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ENGAGEMENT_COLOR = (score: number) =>
  score >= 75 ? "text-emerald-400 bg-emerald-400/15" :
  score >= 50 ? "text-yellow-400 bg-yellow-400/15" :
  score >= 25 ? "text-orange-400 bg-orange-400/15" :
  "text-red-400 bg-red-400/15";

export const GroupHealthCard = React.memo(function GroupHealthCard({
  id,
  name,
  healthStatus,
  memberCount,
  messageCount7d,
  messageHistory,
  slugs,
  engagementScore,
  onTap,
}: GroupHealthCardProps) {
  function handleTap() {
    hapticImpact("light");
    onTap(id);
  }

  return (
    <button
      onClick={handleTap}
      className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 transition active:bg-white/[0.06] text-left"
    >
      {/* Health dot + name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full shrink-0", HEALTH_DOT_COLOR[healthStatus])} />
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Users className="h-2.5 w-2.5" />
            {memberCount ?? "--"}
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <MessageCircle className="h-2.5 w-2.5" />
            {messageCount7d} / 7d
          </span>
        </div>
        {slugs.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {slugs.slice(0, 3).map((slug) => (
              <span
                key={slug}
                className="text-[9px] rounded-full bg-primary/10 text-primary px-1.5 py-px"
              >
                {slug}
              </span>
            ))}
            {slugs.length > 3 && (
              <span className="text-[9px] text-muted-foreground/60">+{slugs.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Engagement score + Sparkline */}
      <div className="flex items-center gap-2 shrink-0">
        {engagementScore != null && (
          <span className={cn("text-[10px] font-bold rounded-md px-1.5 py-0.5", ENGAGEMENT_COLOR(engagementScore))}>
            {engagementScore}
          </span>
        )}
        <MiniSparkline data={messageHistory} healthStatus={healthStatus} />
      </div>
    </button>
  );
});
