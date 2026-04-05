"use client";

import * as React from "react";
import { SECTIONS, type FormData } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, CheckCircle2, AlertCircle, Loader2, Copy, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type ReviewSectionProps = {
  formData: FormData;
  phase: "reviewing" | "submitting" | "done" | "error";
  error: string | null;
  onEditSection: (index: number) => void;
  onSubmit: () => void;
  referenceCode?: string | null;
  score?: number | null;
};

function formatValue(value: string | string[] | undefined, fieldKey: string): string {
  if (value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (fieldKey === "funding_requested" && value) return `$${Number(value).toLocaleString()}`;
  return value;
}

/** Application stage progress tracker */
const APPLICATION_STAGES = ["Submitted", "Under Review", "Shortlisted", "Approved"] as const;

type TrackedApplication = {
  reference_code: string;
  project_name: string;
  current_stage: string;
  stage_index: number;
  is_terminal: boolean;
  score: number | null;
  submitted_at: string;
  stages: { name: string; status: string }[];
};

function StatusTracker() {
  const [refCode, setRefCode] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<TrackedApplication[] | null>(null);
  const [trackError, setTrackError] = React.useState<string | null>(null);

  const handleTrack = async () => {
    const trimmedRef = refCode.trim();
    const trimmedEmail = email.trim();
    if (!trimmedRef || !trimmedEmail) return;
    setLoading(true);
    setTrackError(null);
    setResults(null);
    try {
      const params = `reference=${encodeURIComponent(trimmedRef)}&email=${encodeURIComponent(trimmedEmail)}`;
      const res = await fetch(`/api/applications/status?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setResults(data.applications ?? []);
    } catch (err) {
      setTrackError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-4">
      <h3 className="text-sm font-medium text-white/70">Track Your Application</h3>
      <div className="space-y-2">
        <Input
          value={refCode}
          onChange={(e) => setRefCode(e.target.value)}
          placeholder="Reference code (APP-XXXX)"
          onKeyDown={(e) => e.key === "Enter" && handleTrack()}
        />
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email used when applying"
          onKeyDown={(e) => e.key === "Enter" && handleTrack()}
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={handleTrack} disabled={loading || !refCode.trim() || !email.trim()} size="sm" className="shrink-0 gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Track
        </Button>
      </div>
      {trackError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <span className="text-xs text-red-300">{trackError}</span>
        </div>
      )}
      {results !== null && results.length === 0 && (
        <p className="text-xs text-white/40 text-center py-3">No applications found.</p>
      )}
      {results && results.map((app) => (
        <div key={app.reference_code} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{app.project_name}</p>
              <p className="text-xs text-white/40 font-mono">{app.reference_code}</p>
            </div>
            {app.score !== null && (
              <div className={cn(
                "text-xs font-semibold px-2 py-1 rounded-lg",
                app.score >= 70 ? "bg-green-500/15 text-green-400" :
                app.score >= 40 ? "bg-amber-500/15 text-amber-400" :
                "bg-red-500/15 text-red-400"
              )}>
                Score: {app.score}
              </div>
            )}
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-1">
            {app.stages.map((stage, idx) => {
              if (stage.name === "Rejected" && stage.status !== "rejected") return null;
              return (
                <React.Fragment key={stage.name}>
                  {idx > 0 && stage.name !== "Rejected" && (
                    <div className={cn(
                      "h-0.5 flex-1",
                      stage.status === "completed" || stage.status === "current" || stage.status === "approved"
                        ? "bg-primary" : "bg-white/10"
                    )} />
                  )}
                  <div className="flex flex-col items-center gap-1">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border-2",
                      stage.status === "completed" ? "border-primary bg-primary text-primary-foreground" :
                      stage.status === "current" ? "border-primary bg-transparent text-primary" :
                      stage.status === "approved" ? "border-green-500 bg-green-500 text-white" :
                      stage.status === "rejected" ? "border-red-500 bg-red-500 text-white" :
                      "border-white/20 text-white/30"
                    )}>
                      {stage.status === "completed" || stage.status === "approved" ? (
                        <Check className="w-3 h-3" />
                      ) : stage.status === "rejected" ? "X" : idx + 1}
                    </div>
                    <span className={cn(
                      "text-[8px] whitespace-nowrap",
                      stage.status === "current" ? "text-primary" :
                      stage.status === "rejected" ? "text-red-400" :
                      stage.status === "approved" ? "text-green-400" :
                      stage.status === "completed" ? "text-primary/70" :
                      "text-white/30"
                    )}>
                      {stage.name}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <p className="text-[10px] text-white/30">
            Submitted {new Date(app.submitted_at).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ReviewSection({ formData, phase, error, onEditSection, onSubmit, referenceCode, score }: ReviewSectionProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyRef = () => {
    if (!referenceCode) return;
    navigator.clipboard.writeText(referenceCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // fallback: do nothing
    });
  };

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center animate-fade-in space-y-6">
        <div>
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Application Submitted!</h2>
          <p className="text-sm text-white/50 max-w-sm">
            We&apos;ll review your application and get back to you. Good luck!
          </p>
        </div>

        {/* Reference code card */}
        {referenceCode && (
          <div className="w-full max-w-sm rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <p className="text-xs text-white/50">Your reference number</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-bold text-primary font-mono tracking-wider">{referenceCode}</span>
              <button
                onClick={handleCopyRef}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/40 hover:text-white/70"
                title="Copy reference code"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-white/30">Save this code to track your application status</p>
          </div>
        )}

        {/* Score display */}
        {score !== null && score !== undefined && (
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/50">Profile Completeness</span>
              <span className={cn(
                "text-sm font-semibold",
                score >= 70 ? "text-green-400" : score >= 40 ? "text-amber-400" : "text-red-400"
              )}>{score}/100</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000",
                  score >= 70 ? "bg-green-400" : score >= 40 ? "bg-amber-400" : "bg-red-400"
                )}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        )}

        {/* Progress steps */}
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between">
            {APPLICATION_STAGES.map((stage, idx) => (
              <React.Fragment key={stage}>
                {idx > 0 && <div className={cn("h-0.5 flex-1 mx-1", idx <= 1 ? "bg-primary" : "bg-white/10")} />}
                <div className="flex flex-col items-center gap-1">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2",
                    idx === 0 ? "border-primary bg-primary text-primary-foreground" : "border-white/20 text-white/30"
                  )}>
                    {idx === 0 ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <span className={cn("text-[9px]", idx === 0 ? "text-primary" : "text-white/30")}>{stage}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Status tracker */}
        <div className="w-full max-w-sm pt-4 border-t border-white/5">
          <StatusTracker />
        </div>
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
