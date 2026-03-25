"use client";

import * as React from "react";
import { SECTIONS, type FormData } from "./types";
import { Button } from "@/components/ui/button";
import { Pencil, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type ReviewSectionProps = {
  formData: FormData;
  phase: "reviewing" | "submitting" | "done" | "error";
  error: string | null;
  onEditSection: (index: number) => void;
  onSubmit: () => void;
};

function formatValue(value: string | string[] | undefined, fieldKey: string): string {
  if (value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (fieldKey === "funding_requested" && value) return `$${Number(value).toLocaleString()}`;
  return value;
}

export function ReviewSection({ formData, phase, error, onEditSection, onSubmit }: ReviewSectionProps) {
  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Application Submitted!</h2>
        <p className="text-sm text-white/50 max-w-sm">
          We&apos;ll review your application and get back to you. Good luck!
        </p>
      </div>
    );
  }

  const displaySections = SECTIONS.filter((s) => s.fields.length > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {displaySections.map((section, sIdx) => (
        <div key={section.id} className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <h3 className="text-sm font-medium text-white/70">{section.title}</h3>
            <button
              type="button"
              onClick={() => onEditSection(sIdx)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {section.fields.map((field) => (
              <div key={field.key} className="px-4 py-3">
                <div className="text-xs text-white/40 mb-0.5">{field.label}</div>
                <div className="text-sm text-white/90 break-words">
                  {formatValue(formData[field.key], field.key)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm text-red-300">{error}</div>
        </div>
      )}

      <Button
        onClick={onSubmit}
        disabled={phase === "submitting"}
        className="w-full h-12 text-base font-medium"
        size="lg"
      >
        {phase === "submitting" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit Application"
        )}
      </Button>
    </div>
  );
}
