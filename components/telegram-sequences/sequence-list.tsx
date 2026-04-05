"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Play,
  Pause,
  Copy,
  Trash2,
  Pencil,
  Users,
  MessageSquare,
  Search,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TGSequence, TriggerType } from "./types";
import { TRIGGER_TYPE_LABELS } from "./types";

const TRIGGER_ICONS: Record<TriggerType, React.ElementType> = {
  manual: Play,
  group_join: Users,
  first_message: MessageSquare,
  keyword_match: Search,
};

interface SequenceListProps {
  sequences: TGSequence[];
  loading?: boolean;
  onEdit: (sequence: TGSequence) => void;
  onCreate: () => void;
  onDuplicate: (sequence: TGSequence) => void;
  onToggleActive: (sequence: TGSequence) => void;
  onDelete: (sequence: TGSequence) => void;
}

export function SequenceList({
  sequences,
  loading,
  onEdit,
  onCreate,
  onDuplicate,
  onToggleActive,
  onDelete,
}: SequenceListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Zap className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">No sequences yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create your first Telegram sequence to automate outreach
          </p>
        </div>
        <Button size="sm" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Sequence
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sequences.length} sequence{sequences.length === 1 ? "" : "s"}
        </p>
        <Button size="sm" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Sequence
        </Button>
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Name</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Trigger</th>
              <th className="text-center font-medium text-muted-foreground px-4 py-2.5">Status</th>
              <th className="text-center font-medium text-muted-foreground px-4 py-2.5">Enrolled</th>
              <th className="text-center font-medium text-muted-foreground px-4 py-2.5">Reply Rate</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Created</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sequences.map((seq) => {
              const TriggerIcon = TRIGGER_ICONS[seq.trigger_type] ?? Zap;
              return (
                <tr
                  key={seq.id}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onEdit(seq)}
                      className="text-foreground hover:text-primary font-medium text-left"
                    >
                      {seq.name}
                    </button>
                    {seq.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px]">
                        {seq.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <TriggerIcon className="h-3 w-3" />
                      {TRIGGER_TYPE_LABELS[seq.trigger_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        seq.is_active
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-white/5 text-muted-foreground"
                      )}
                    >
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        seq.is_active ? "bg-emerald-400" : "bg-muted-foreground"
                      )} />
                      {seq.is_active ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {seq.stats.enrolled}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {seq.stats.reply_rate > 0 ? `${seq.stats.reply_rate.toFixed(1)}%` : "--"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(seq.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(seq)}
                        className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onDuplicate(seq)}
                        className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onToggleActive(seq)}
                        className={cn(
                          "p-1.5 rounded hover:bg-white/5 transition-colors",
                          seq.is_active
                            ? "text-emerald-400 hover:text-yellow-400"
                            : "text-muted-foreground hover:text-emerald-400"
                        )}
                        title={seq.is_active ? "Pause" : "Activate"}
                      >
                        {seq.is_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => onDelete(seq)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
