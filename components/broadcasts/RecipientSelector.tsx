"use client";

import * as React from "react";
import { Tag, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TgGroup } from "./types";

interface RecipientSelectorProps {
  groups: TgGroup[];
  filteredGroups: TgGroup[];
  allSlugs: string[];
  selectedSlug: string | null;
  selectedSlugs: Set<string>;
  slugMode: "any" | "all";
  selectedGroupIds: Set<string>;
  onSlugChange: (slug: string | null) => void;
  onSlugsChange: (slugs: Set<string>) => void;
  onSlugModeChange: (mode: "any" | "all") => void;
  onToggleGroup: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

export function RecipientSelector({
  groups,
  filteredGroups,
  allSlugs,
  selectedSlug,
  selectedSlugs,
  slugMode,
  selectedGroupIds,
  onSlugChange,
  onSlugsChange,
  onSlugModeChange,
  onToggleGroup,
  onSelectAll,
  onSelectNone,
}: RecipientSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Slug filter — multi-select */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Tag className="h-4 w-4 text-purple-400" />
            Target by Slug
          </h2>
          {selectedSlugs.size > 1 && (
            <div className="flex gap-1 rounded-lg border border-white/10 p-0.5">
              <button
                onClick={() => onSlugModeChange("any")}
                className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors", slugMode === "any" ? "bg-white/10 text-foreground" : "text-muted-foreground")}
              >
                Any (OR)
              </button>
              <button
                onClick={() => onSlugModeChange("all")}
                className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors", slugMode === "all" ? "bg-white/10 text-foreground" : "text-muted-foreground")}
              >
                All (AND)
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { onSlugChange(null); onSlugsChange(new Set()); }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              !selectedSlug && selectedSlugs.size === 0
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:bg-white/5"
            )}
          >
            All
          </button>
          {allSlugs.map((slug) => {
            const isActive = selectedSlugs.has(slug) || selectedSlug === slug;
            return (
              <button
                key={slug}
                onClick={() => {
                  onSlugChange(null);
                  const next = new Set(selectedSlugs);
                  if (next.has(slug)) next.delete(slug);
                  else next.add(slug);
                  onSlugsChange(next);
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-white/5"
                )}
              >
                {slug} ({groups.filter((g) => g.slugs.includes(slug)).length})
              </button>
            );
          })}
          {allSlugs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No slugs defined. Add slugs to groups first.
            </p>
          )}
        </div>
        {selectedSlugs.size > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {filteredGroups.length} group{filteredGroups.length !== 1 ? "s" : ""} match{filteredGroups.length === 1 ? "es" : ""} ({slugMode === "any" ? "any" : "all"} of {selectedSlugs.size} slug{selectedSlugs.size !== 1 ? "s" : ""})
          </p>
        )}
      </div>

      {/* Group list */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            Groups ({filteredGroups.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={onSelectAll}
              className="text-xs text-primary hover:underline"
            >
              Select all
            </button>
            <button
              onClick={onSelectNone}
              className="text-xs text-muted-foreground hover:underline"
            >
              None
            </button>
          </div>
        </div>

        <div className="space-y-1 max-h-[400px] overflow-y-auto thin-scroll">
          {filteredGroups.map((group) => (
            <label
              key={group.id}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition",
                selectedGroupIds.has(group.id)
                  ? "bg-white/[0.06]"
                  : "hover:bg-white/[0.03]"
              )}
            >
              <input
                type="checkbox"
                checked={selectedGroupIds.has(group.id)}
                onChange={() => onToggleGroup(group.id)}
                className="rounded border-white/20"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {group.group_name}
                </p>
                <div className="flex items-center gap-1.5">
                  {group.slugs.map((s) => (
                    <span
                      key={s}
                      className="text-[9px] text-primary bg-primary/10 rounded px-1 py-0.5"
                    >
                      {s}
                    </span>
                  ))}
                  {group.member_count != null && (
                    <span className="text-[9px] text-muted-foreground">
                      {group.member_count} members
                    </span>
                  )}
                </div>
              </div>
              {!group.bot_is_admin && (
                <span className="text-[9px] text-red-400">Not admin</span>
              )}
            </label>
          ))}
          {filteredGroups.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No groups available. Connect groups in Telegram Settings
              first.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
