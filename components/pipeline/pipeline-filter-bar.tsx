"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { PipelineFilters } from "@/app/pipeline/page";

type PipelineFilterBarProps = {
  filters: PipelineFilters;
  onChange: (filters: PipelineFilters) => void;
  onClear: () => void;
  assignedProfiles: { id: string; display_name: string }[];
};

export function PipelineFilterBar({ filters, onChange, onClear, assignedProfiles }: PipelineFilterBarProps) {
  function set<K extends keyof PipelineFilters>(key: K, val: PipelineFilters[K]) {
    onChange({ ...filters, [key]: val });
  }

  function parseNum(v: string): number | null {
    const n = Number(v);
    return v === "" || isNaN(n) ? null : n;
  }

  const hasAny = Object.values(filters).some((v) => v != null);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Filters</span>
        {hasAny && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-6 px-2 text-xs text-muted-foreground">
            <X className="h-3 w-3 mr-1" /> Clear all
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {/* Value range */}
        <div>
          <label className="text-[10px] text-muted-foreground/70">Min Value ($)</label>
          <Input
            type="number"
            value={filters.minValue ?? ""}
            onChange={(e) => set("minValue", parseNum(e.target.value))}
            placeholder="0"
            className="h-7 text-xs mt-0.5"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground/70">Max Value ($)</label>
          <Input
            type="number"
            value={filters.maxValue ?? ""}
            onChange={(e) => set("maxValue", parseNum(e.target.value))}
            placeholder="Any"
            className="h-7 text-xs mt-0.5"
          />
        </div>

        {/* Probability range */}
        <div>
          <label className="text-[10px] text-muted-foreground/70">Min Probability (%)</label>
          <Input
            type="number"
            value={filters.minProbability ?? ""}
            onChange={(e) => set("minProbability", parseNum(e.target.value))}
            placeholder="0"
            className="h-7 text-xs mt-0.5"
            min={0}
            max={100}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground/70">Max Probability (%)</label>
          <Input
            type="number"
            value={filters.maxProbability ?? ""}
            onChange={(e) => set("maxProbability", parseNum(e.target.value))}
            placeholder="100"
            className="h-7 text-xs mt-0.5"
            min={0}
            max={100}
          />
        </div>

        {/* Assigned to */}
        <div>
          <label className="text-[10px] text-muted-foreground/70">Assigned To</label>
          <select
            value={filters.assignedTo ?? ""}
            onChange={(e) => set("assignedTo", e.target.value || null)}
            className="h-7 w-full rounded-xl border border-white/10 bg-white/5 px-2 text-xs text-foreground outline-none mt-0.5 appearance-none"
          >
            <option value="" className="bg-[hsl(225,35%,6%)]">Anyone</option>
            <option value="__unassigned" className="bg-[hsl(225,35%,6%)]">Unassigned</option>
            {assignedProfiles.map((p) => (
              <option key={p.id} value={p.id} className="bg-[hsl(225,35%,6%)]">{p.display_name}</option>
            ))}
          </select>
        </div>

        {/* Stage age */}
        <div>
          <label className="text-[10px] text-muted-foreground/70">Stale (days in stage)</label>
          <Input
            type="number"
            value={filters.staleDays ?? ""}
            onChange={(e) => set("staleDays", parseNum(e.target.value))}
            placeholder="Any"
            className="h-7 text-xs mt-0.5"
            min={0}
          />
        </div>

        {/* Outcome */}
        <div>
          <label className="text-[10px] text-muted-foreground/70">Outcome</label>
          <select
            value={filters.outcome ?? ""}
            onChange={(e) => set("outcome", e.target.value || null)}
            className="h-7 w-full rounded-xl border border-white/10 bg-white/5 px-2 text-xs text-foreground outline-none mt-0.5 appearance-none"
          >
            <option value="" className="bg-[hsl(225,35%,6%)]">Any</option>
            <option value="open" className="bg-[hsl(225,35%,6%)]">Open</option>
            <option value="won" className="bg-[hsl(225,35%,6%)]">Won</option>
            <option value="lost" className="bg-[hsl(225,35%,6%)]">Lost</option>
          </select>
        </div>
      </div>
    </div>
  );
}
