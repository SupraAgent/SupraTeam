"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { StepDef } from "./types";
import { ChatCombobox } from "./chat-combobox";
import { ChatMultiCombobox } from "./chat-multi-combobox";
import { ArrowRight } from "lucide-react";

type StepInputProps = {
  step: StepDef;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  onSubmit: () => void;
};

export function StepInput({ step, value, onChange, onSubmit }: StepInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && step.inputType !== "textarea") {
      e.preventDefault();
      onSubmit();
    }
  };

  const canSubmit = step.required
    ? Array.isArray(value) ? value.length > 0 : !!value?.toString().trim()
    : true;

  return (
    <div className="flex flex-col gap-3 animate-slide-up">
      {step.inputType === "text" || step.inputType === "url" ? (
        <input
          type={step.inputType === "url" ? "url" : "text"}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={step.placeholder}
          className={cn(
            "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white",
            "placeholder:text-white/30 outline-none transition-colors",
            "focus:border-[hsl(var(--primary))]/50"
          )}
          autoFocus
        />
      ) : step.inputType === "textarea" ? (
        <textarea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={step.placeholder}
          rows={3}
          className={cn(
            "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white",
            "placeholder:text-white/30 outline-none transition-colors resize-none",
            "focus:border-[hsl(var(--primary))]/50"
          )}
          autoFocus
        />
      ) : step.inputType === "number" ? (
        <input
          type="number"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={step.placeholder}
          min={0}
          className={cn(
            "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white",
            "placeholder:text-white/30 outline-none transition-colors",
            "focus:border-[hsl(var(--primary))]/50"
          )}
          autoFocus
        />
      ) : step.inputType === "combobox" ? (
        <ChatCombobox
          options={step.options || []}
          value={value as string}
          onChange={(v) => onChange(v)}
          placeholder={step.placeholder}
        />
      ) : step.inputType === "multi-combobox" ? (
        <ChatMultiCombobox
          options={step.options || []}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => onChange(v)}
          placeholder={step.placeholder}
        />
      ) : null}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className={cn(
          "self-end flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all",
          "active:scale-[0.97]",
          canSubmit
            ? "bg-[hsl(var(--primary))] text-white hover:brightness-110"
            : "bg-white/5 text-white/20 cursor-not-allowed"
        )}
      >
        {step.required ? "Next" : "Skip / Next"}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
