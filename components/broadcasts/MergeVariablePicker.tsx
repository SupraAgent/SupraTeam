"use client";

import * as React from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { MERGE_VARIABLES, TEMPLATE_FILTERS } from "@/lib/telegram-templates";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  contact: { label: "Contact", color: "text-blue-400" },
  deal: { label: "Deal", color: "text-emerald-400" },
  sender: { label: "Sender", color: "text-purple-400" },
  group: { label: "Group", color: "text-amber-400" },
  system: { label: "System", color: "text-cyan-400" },
};

interface MergeVariablePickerProps {
  onInsert: (token: string) => void;
}

export function MergeVariablePicker({ onInsert }: MergeVariablePickerProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);

  // Quick chips (most used)
  const quickVars = [
    ...MERGE_VARIABLES.contact.slice(0, 3),
    ...MERGE_VARIABLES.deal.slice(0, 2),
    ...MERGE_VARIABLES.sender.slice(0, 1),
  ];

  return (
    <div className="space-y-1.5">
      {/* Quick chips row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Sparkles className="h-3 w-3 text-muted-foreground shrink-0" />
        {quickVars.map((v) => (
          <button
            key={v.key}
            onClick={() => onInsert(`{{${v.key}}}`)}
            className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 min-h-[32px] text-[11px] font-mono text-primary hover:bg-primary/20 active:bg-primary/30 transition-colors cursor-pointer"
            title={v.hint}
          >
            {`{{${v.key}}}`}
          </button>
        ))}
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "rounded-md px-2 py-1 min-h-[32px] text-[11px] font-medium transition-colors flex items-center gap-0.5",
            expanded ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          {expanded ? "Less" : "All Variables"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        </button>
        <button
          onClick={() => { setShowFilters(!showFilters); if (!showFilters) setExpanded(false); }}
          className={cn(
            "rounded-md px-2 py-1 min-h-[32px] text-[11px] font-medium transition-colors",
            showFilters ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          Filters
        </button>
      </div>

      {/* Expanded: all categories */}
      {expanded && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 space-y-2">
          {(Object.entries(MERGE_VARIABLES) as [string, readonly { key: string; label: string; hint: string }[]][]).map(([cat, vars]) => {
            const cfg = CATEGORY_LABELS[cat] ?? { label: cat, color: "text-muted-foreground" };
            return (
              <div key={cat}>
                <p className={cn("text-xs font-medium mb-1", cfg.color)}>{cfg.label}</p>
                <div className="flex flex-wrap gap-1">
                  {vars.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => onInsert(`{{${v.key}}}`)}
                      className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 min-h-[32px] text-[11px] font-mono text-foreground hover:bg-white/10 active:bg-white/15 transition-colors"
                      title={v.hint}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="border-t border-white/5 pt-1.5">
            <p className="text-xs text-muted-foreground">
              Conditionals: <code className="text-[11px] bg-white/5 px-1 rounded">{`{{#if var}}...{{/if}}`}</code>{" "}
              <code className="text-[11px] bg-white/5 px-1 rounded">{`{{#unless var}}...{{/unless}}`}</code>{" "}
              <code className="text-[11px] bg-white/5 px-1 rounded">{`{{#ifgt value 1000}}...{{/ifgt}}`}</code>
            </p>
          </div>
        </div>
      )}

      {/* Filters panel */}
      {showFilters && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 space-y-1.5">
          <p className="text-xs text-muted-foreground">Transform filters — append with <code className="bg-white/5 px-1 rounded">|</code></p>
          <div className="flex flex-wrap gap-1">
            {TEMPLATE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => onInsert(`|${f.key}`)}
                className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 min-h-[32px] text-[11px] font-mono text-amber-400 hover:bg-amber-500/15 active:bg-amber-500/25 transition-colors"
                title={`${f.hint} — ${f.example}`}
              >
                |{f.key}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60">
            Example: <code className="bg-white/5 px-1 rounded">{`{{contact_name|upper}}`}</code> or <code className="bg-white/5 px-1 rounded">{`{{value|currency}}`}</code>
          </p>
        </div>
      )}
    </div>
  );
}
