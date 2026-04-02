"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Trophy, ArrowRight, Users, Plus, Check, Swords } from "lucide-react";

interface Quest {
  id: string;
  title: string;
  current: number;
  target: number;
  icon: string;
  color: string;
}

const ICONS: Record<string, React.ElementType> = {
  trophy: Trophy,
  "arrow-right": ArrowRight,
  users: Users,
  plus: Plus,
};

export function QuestProgressWidget() {
  const [quests, setQuests] = React.useState<Quest[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/dashboard/quests")
      .then((r) => r.ok ? r.json() : { quests: [] })
      .then((d) => setQuests(d.quests ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3 animate-pulse">
        <div className="h-4 w-28 rounded bg-white/5" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 rounded-lg bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  const completedCount = quests.filter((q) => q.current >= q.target).length;
  const allComplete = completedCount === quests.length && quests.length > 0;

  return (
    <div className={cn(
      "rounded-2xl border bg-white/[0.02] p-4 space-y-3",
      allComplete ? "border-amber-400/30" : "border-white/10"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">Weekly Quests</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {completedCount}/{quests.length} done
        </span>
      </div>

      <div className="space-y-2.5">
        {quests.map((quest) => {
          const Icon = ICONS[quest.icon] ?? Trophy;
          const pct = quest.target > 0 ? Math.min(100, (quest.current / quest.target) * 100) : 0;
          const complete = quest.current >= quest.target;

          return (
            <div key={quest.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-5 w-5 rounded flex items-center justify-center",
                      complete ? "bg-amber-400/20" : "bg-white/5"
                    )}
                    style={complete ? undefined : { backgroundColor: `${quest.color}15` }}
                  >
                    {complete ? (
                      <Check className="h-3 w-3 text-amber-400" />
                    ) : (
                      <Icon className="h-3 w-3" style={{ color: quest.color }} />
                    )}
                  </div>
                  <span className={cn(
                    "text-xs",
                    complete ? "text-muted-foreground line-through" : "text-foreground"
                  )}>
                    {quest.title}
                  </span>
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  complete ? "text-amber-400" : "text-muted-foreground"
                )}>
                  {quest.current}/{quest.target}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    complete && "gold-hot-bar"
                  )}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: complete ? "#fbbf24" : quest.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {allComplete && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/5 text-[10px] text-amber-400 font-medium">
          <Trophy className="h-3 w-3" />
          All quests complete! Resets Monday.
        </div>
      )}
    </div>
  );
}
