"use client";

import * as React from "react";
import { SECTIONS, type FormState, type FormAction, type FormData } from "./types";
import { StepIndicator } from "./step-indicator";
import { FormField } from "./form-field";
import { SearchableCombobox } from "./searchable-combobox";
import { MultiSelectCombobox } from "./multi-select-combobox";
import { ReviewSection } from "./review-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

function reducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "NEXT_SECTION": {
      const next = state.currentSection + 1;
      const isReview = next >= SECTIONS.length - 1;
      return {
        ...state,
        currentSection: next,
        direction: "forward",
        phase: isReview ? "reviewing" : "filling",
        errors: {},
      };
    }
    case "PREV_SECTION":
      return {
        ...state,
        currentSection: Math.max(0, state.currentSection - 1),
        direction: "back",
        phase: "filling",
        errors: {},
      };
    case "GO_TO_SECTION":
      return {
        ...state,
        currentSection: action.index,
        direction: action.index < state.currentSection ? "back" : "forward",
        phase: "filling",
        errors: {},
      };
    case "SET_FIELD":
      return {
        ...state,
        formData: { ...state.formData, [action.key]: action.value },
        errors: { ...state.errors, [action.key]: "" },
      };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "CLEAR_ERROR":
      return { ...state, errors: { ...state.errors, [action.key]: "" } };
    case "START_REVIEW":
      return { ...state, phase: "reviewing", currentSection: SECTIONS.length - 1, direction: "forward" };
    case "CONFIRM_SUBMIT":
      return { ...state, phase: "submitting", submitError: null };
    case "SUBMIT_SUCCESS":
      return { ...state, phase: "done", dealId: action.dealId, referenceCode: action.referenceCode, score: action.score };
    case "SUBMIT_ERROR":
      return { ...state, phase: "error", submitError: action.error };
    default:
      return state;
  }
}

const INITIAL_STATE: FormState = {
  currentSection: 0,
  formData: {},
  errors: {},
  phase: "filling",
  direction: "forward",
  dealId: null,
  referenceCode: null,
  score: null,
  submitError: null,
};

function validateSection(sectionIndex: number, formData: FormData): Record<string, string> {
  const section = SECTIONS[sectionIndex];
  if (!section) return {};
  const errors: Record<string, string> = {};

  for (const field of section.fields) {
    const val = formData[field.key];
    if (field.required) {
      if (Array.isArray(val)) {
        if (val.length === 0) errors[field.key] = `${field.label} is required`;
      } else if (!val?.toString().trim()) {
        errors[field.key] = `${field.label} is required`;
      }
    }
    if (field.inputType === "url" && val && typeof val === "string" && val.trim()) {
      try {
        new URL(val);
      } catch {
        errors[field.key] = "Please enter a valid URL";
      }
    }
  }
  return errors;
}

type Props = {
  mode: "tma" | "web";
  telegramInitData?: string;
  telegramUser?: { id: number; first_name: string; last_name?: string; username?: string };
};

export function ApplicationForm({ mode, telegramInitData, telegramUser }: Props) {
  const [state, dispatch] = React.useReducer(reducer, INITIAL_STATE);
  const [animKey, setAnimKey] = React.useState(0);

  const section = SECTIONS[state.currentSection];
  const isReviewStep = state.currentSection === SECTIONS.length - 1;
  const isFirstStep = state.currentSection === 0;

  const handleNext = () => {
    const errors = validateSection(state.currentSection, state.formData);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: "SET_ERRORS", errors });
      return;
    }
    setAnimKey((k) => k + 1);
    if (state.currentSection === SECTIONS.length - 2) {
      dispatch({ type: "START_REVIEW" });
    } else {
      dispatch({ type: "NEXT_SECTION" });
    }
  };

  const handleBack = () => {
    setAnimKey((k) => k + 1);
    dispatch({ type: "PREV_SECTION" });
  };

  const handleEditSection = (index: number) => {
    setAnimKey((k) => k + 1);
    dispatch({ type: "GO_TO_SECTION", index });
  };

  const handleSubmit = async () => {
    dispatch({ type: "CONFIRM_SUBMIT" });
    try {
      const payload: Record<string, unknown> = {
        ...state.formData,
        funding_requested: state.formData.funding_requested
          ? Number(state.formData.funding_requested)
          : undefined,
        team_size: state.formData.team_size
          ? Number(state.formData.team_size)
          : undefined,
      };

      if (mode === "tma" && telegramInitData) {
        payload.initData = telegramInitData;
      }

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      dispatch({
        type: "SUBMIT_SUCCESS",
        dealId: data.deal_id,
        referenceCode: data.reference_code ?? "",
        score: data.score ?? 0,
      });
    } catch (err) {
      dispatch({
        type: "SUBMIT_ERROR",
        error: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  };

  const setField = (key: string, value: string | string[]) => {
    dispatch({ type: "SET_FIELD", key, value });
  };

  const greeting = telegramUser?.first_name || "there";

  return (
    <div className="flex flex-col h-[100dvh] bg-[hsl(225,35%,5%)]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-sm font-bold">S</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">SuperDapp Competition</h1>
              {mode === "tma" && (
                <p className="text-xs text-white/40">Hey {greeting}!</p>
              )}
            </div>
          </div>
          <StepIndicator
            sections={SECTIONS.map((s) => ({ id: s.id, title: s.title }))}
            activeIndex={state.currentSection}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <div
            key={animKey}
            className={state.direction === "forward" ? "animate-slide-left-in" : "animate-slide-right-in"}
          >
            {isReviewStep ? (
              <ReviewSection
                formData={state.formData}
                phase={state.phase === "error" ? "reviewing" : (state.phase as "reviewing" | "submitting" | "done")}
                error={state.submitError}
                onEditSection={handleEditSection}
                onSubmit={handleSubmit}
                referenceCode={state.referenceCode}
                score={state.score}
              />
            ) : (
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">{section.title}</h2>
                <p className="text-sm text-white/40 mb-6">{section.subtitle}</p>

                <div className="space-y-5 pb-32">
                  {section.fields.map((field) => {
                    const val = state.formData[field.key];
                    const err = state.errors[field.key];

                    if (field.inputType === "combobox") {
                      return (
                        <FormField
                          key={field.key}
                          label={field.label}
                          required={field.required}
                          error={err}
                        >
                          <SearchableCombobox
                            options={field.options || []}
                            value={(val as string) || ""}
                            onChange={(v) => setField(field.key, v)}
                            placeholder={field.placeholder}
                            error={!!err}
                          />
                        </FormField>
                      );
                    }

                    if (field.inputType === "multi-combobox") {
                      return (
                        <FormField
                          key={field.key}
                          label={field.label}
                          required={field.required}
                          error={err}
                        >
                          <MultiSelectCombobox
                            options={field.options || []}
                            value={(val as string[]) || []}
                            onChange={(v) => setField(field.key, v)}
                            placeholder={field.placeholder}
                            error={!!err}
                          />
                        </FormField>
                      );
                    }

                    if (field.inputType === "textarea") {
                      return (
                        <FormField
                          key={field.key}
                          label={field.label}
                          required={field.required}
                          error={err}
                          helperText={field.helperText}
                        >
                          <Textarea
                            value={(val as string) || ""}
                            onChange={(e) => setField(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className={err ? "border-red-500/50" : ""}
                          />
                        </FormField>
                      );
                    }

                    return (
                      <FormField
                        key={field.key}
                        label={field.label}
                        required={field.required}
                        error={err}
                        helperText={field.helperText}
                      >
                        <Input
                          type={field.inputType === "number" ? "number" : field.inputType === "url" ? "url" : "text"}
                          value={(val as string) || ""}
                          onChange={(e) => setField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className={err ? "border-red-500/50" : ""}
                        />
                      </FormField>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation footer */}
      {state.phase === "filling" && (
        <div className="shrink-0 px-4 py-4 border-t border-white/5">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {!isFirstStep && (
              <Button variant="secondary" onClick={handleBack} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            <Button onClick={handleNext} className="flex-1 gap-2">
              {state.currentSection === SECTIONS.length - 2 ? "Review" : "Next"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
