"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { PANELS } from "@/lib/plugins/registry";
import type { PanelId } from "@/lib/plugins/types";
import { Check, Plus, RotateCcw, X } from "lucide-react";

interface PanelPickerProps {
  open: boolean;
  onClose: () => void;
  enabledPanels: PanelId[];
  onToggle: (id: PanelId) => void;
  onReset: () => void;
}

export function PanelPicker({ open, onClose, enabledPanels, onToggle, onReset }: PanelPickerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-4 top-16 z-50 w-80 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "hsl(var(--surface-4))" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-sm font-semibold text-foreground">Dashboard Panels</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onReset}
              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
              title="Reset to defaults"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="p-2 max-h-96 overflow-y-auto thin-scroll">
          {PANELS.map((panel) => {
            const enabled = enabledPanels.includes(panel.id);
            const Icon = panel.icon;
            return (
              <button
                key={panel.id}
                onClick={() => onToggle(panel.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left",
                  enabled
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-white/5 text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{panel.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{panel.description}</div>
                </div>
                {enabled ? (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
