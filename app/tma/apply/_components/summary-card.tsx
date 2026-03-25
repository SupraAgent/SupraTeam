"use client";

import { cn } from "@/lib/utils";
import { Pencil, Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { STEPS, type FlowPhase } from "./types";

type SummaryCardProps = {
  answers: Record<string, string | string[]>;
  phase: FlowPhase;
  error: string | null;
  onEdit: (fieldKey: string) => void;
  onSubmit: () => void;
};

function formatValue(value: string | string[], stepId: string): string {
  if (Array.isArray(value)) return value.join(", ");
  if (stepId === "funding_requested" && value) return `$${Number(value).toLocaleString()}`;
  return value || "—";
}

export function SummaryCard({ answers, phase, error, onEdit, onSubmit }: SummaryCardProps) {
  if (phase === "done") {
    return (
      <div className="rounded-2xl border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 p-6 animate-slide-up">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="w-12 h-12 text-[hsl(var(--primary))]" />
          <h3 className="text-lg font-semibold text-white">Application Submitted!</h3>
          <p className="text-sm text-white/60">
            We&apos;ve received your application. Our team will review it and get back to you via Telegram.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden animate-slide-up">
      <div className="px-4 py-3 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white">Application Summary</h3>
        <p className="text-xs text-white/40 mt-0.5">Review your details before submitting</p>
      </div>

      <div className="divide-y divide-white/5">
        {STEPS.map((step) => {
          const val = answers[step.fieldKey];
          if (!val || (Array.isArray(val) && val.length === 0)) {
            if (step.required) return null; // shouldn't happen
            return null; // skip empty optional fields
          }

          return (
            <div key={step.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider">
                  {step.question.replace(/\?.*/, "").replace(/\(.*\)/, "").trim()}
                </div>
                <div className="text-sm text-white/80 mt-0.5 break-words">
                  {formatValue(val, step.id)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onEdit(step.fieldKey)}
                className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      <div className="p-4 pt-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={phase === "submitting"}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all",
            "active:scale-[0.97]",
            phase === "submitting"
              ? "bg-[hsl(var(--primary))]/50 text-white/60 cursor-wait"
              : "bg-[hsl(var(--primary))] text-white hover:brightness-110"
          )}
        >
          {phase === "submitting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submit Application
            </>
          )}
        </button>
      </div>
    </div>
  );
}
