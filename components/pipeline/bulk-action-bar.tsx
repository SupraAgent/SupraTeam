"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { PipelineStage } from "@/lib/types";
import { CheckSquare, ArrowRight, Trophy, XCircle, Trash2, X } from "lucide-react";

type BulkActionBarProps = {
  count: number;
  stages: PipelineStage[];
  onMove: (stageId: string) => void;
  onDelete: () => void;
  onOutcome: (outcome: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

export function BulkActionBar({ count, stages, onMove, onDelete, onOutcome, onSelectAll, onClear }: BulkActionBarProps) {
  const [showMoveMenu, setShowMoveMenu] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CheckSquare className="h-4 w-4 text-primary" />
        {count} selected
      </div>

      <div className="flex items-center gap-1.5 ml-auto flex-wrap">
        <Button variant="ghost" size="sm" onClick={onSelectAll} className="h-7 text-xs">
          Select all
        </Button>

        {/* Move to stage */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowMoveMenu(!showMoveMenu); setConfirmDelete(false); }}
            className="h-7 text-xs"
          >
            <ArrowRight className="h-3 w-3 mr-1" /> Move to
          </Button>
          {showMoveMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-white/10 bg-[hsl(225,35%,8%)] shadow-xl py-1 min-w-[180px]">
              {stages.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onMove(s.id); setShowMoveMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-white/10 flex items-center gap-2"
                >
                  {s.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />}
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mark won/lost */}
        <Button variant="ghost" size="sm" onClick={() => onOutcome("won")} className="h-7 text-xs text-green-400 hover:text-green-300">
          <Trophy className="h-3 w-3 mr-1" /> Won
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOutcome("lost")} className="h-7 text-xs text-red-400 hover:text-red-300">
          <XCircle className="h-3 w-3 mr-1" /> Lost
        </Button>

        {/* Delete */}
        {confirmDelete ? (
          <Button variant="ghost" size="sm" onClick={() => { onDelete(); setConfirmDelete(false); }} className="h-7 text-xs text-red-400 hover:text-red-300">
            Confirm delete {count}?
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="h-7 text-xs text-muted-foreground">
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        )}

        <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs text-muted-foreground">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
