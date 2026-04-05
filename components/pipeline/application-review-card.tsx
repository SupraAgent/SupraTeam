"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Deal, PipelineStage } from "@/lib/types";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  ClipboardList,
  Github,
  Globe,
  Monitor,
} from "lucide-react";

interface ApplicationReviewCardProps {
  deal: Deal;
  stages: PipelineStage[];
  customValues: Record<string, string>;
  fieldLabels?: Record<string, string>;
  onStageChange: (stageId: string) => void;
  onUpdated?: () => void;
}

/** Quick-action stage names for Applications board */
const STAGE_ACTIONS: { name: string; color: string; icon: React.ReactNode }[] = [
  { name: "Under Review", color: "amber", icon: <ClipboardList className="w-3 h-3" /> },
  { name: "Shortlisted", color: "blue", icon: <ArrowRight className="w-3 h-3" /> },
  { name: "Approved", color: "green", icon: <CheckCircle2 className="w-3 h-3" /> },
  { name: "Rejected", color: "red", icon: <XCircle className="w-3 h-3" /> },
];

export function ApplicationReviewCard({
  deal,
  stages,
  customValues,
  fieldLabels,
  onStageChange,
  onUpdated,
}: ApplicationReviewCardProps) {
  const [copied, setCopied] = React.useState(false);
  const [movingTo, setMovingTo] = React.useState<string | null>(null);

  // Only show for Applications board
  if (deal.board_type !== "Applications") return null;

  const fieldEntries = Object.entries(customValues);

  const handleQuickAction = async (stageName: string) => {
    if (stageName === "Rejected" && !confirm("Reject this application? This action is terminal.")) {
      return;
    }
    const stage = stages.find((s) => s.name === stageName);
    if (!stage) {
      toast.error(`Stage "${stageName}" not found`);
      return;
    }
    setMovingTo(stageName);
    try {
      await Promise.resolve(onStageChange(stage.id));
      onUpdated?.();
    } catch {
      toast.error(`Failed to move to "${stageName}"`);
    } finally {
      setTimeout(() => setMovingTo(null), 500);
    }
  };

  const handleCopyRef = () => {
    if (!deal.reference_code) return;
    navigator.clipboard.writeText(deal.reference_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const currentStage = stages.find((s) => s.id === deal.stage_id);

  return (
    <div className="space-y-3">
      {/* Score + Reference header */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
            Application Review
          </h3>
          {deal.reference_code && (
            <button
              onClick={handleCopyRef}
              className="flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
              title="Copy reference code"
            >
              {deal.reference_code}
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Auto-score display */}
        {deal.health_score !== null && deal.health_score !== undefined && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground">Auto-Score</span>
              <span className={cn(
                "text-lg font-bold",
                deal.health_score >= 70 ? "text-green-400" :
                deal.health_score >= 40 ? "text-amber-400" :
                "text-red-400"
              )}>
                {deal.health_score}<span className="text-xs text-muted-foreground font-normal">/100</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  deal.health_score >= 70 ? "bg-green-400" :
                  deal.health_score >= 40 ? "bg-amber-400" :
                  "bg-red-400"
                )}
                style={{ width: `${deal.health_score}%` }}
              />
            </div>
          </div>
        )}

        {/* Current stage badge */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Status:</span>
          <span className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            currentStage?.name === "Submitted" ? "bg-indigo-500/15 text-indigo-400" :
            currentStage?.name === "Under Review" ? "bg-amber-500/15 text-amber-400" :
            currentStage?.name === "Shortlisted" ? "bg-blue-500/15 text-blue-400" :
            currentStage?.name === "Approved" ? "bg-green-500/15 text-green-400" :
            currentStage?.name === "Rejected" ? "bg-red-500/15 text-red-400" :
            "bg-white/10 text-white/60"
          )}>
            {currentStage?.name ?? "Unknown"}
          </span>
        </div>
      </div>

      {/* Application details from custom fields */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="px-3 py-2 border-b border-white/5">
          <h4 className="text-[11px] font-medium text-white/50">Application Details</h4>
        </div>
        <div className="divide-y divide-white/5">
          {fieldEntries.map(([fieldId, value]) => {
            if (!value) return null;

            const label = fieldLabels?.[fieldId] ?? fieldId.replace(/_/g, " ");

            // Detect URLs
            const isUrl = value.startsWith("http://") || value.startsWith("https://");

            // Detect JSON arrays
            let arrayValues: string[] | null = null;
            try {
              const parsed: unknown = JSON.parse(value);
              if (Array.isArray(parsed)) arrayValues = parsed as string[];
            } catch {
              // not JSON
            }

            // Detect numeric values
            const isNumber = !isNaN(Number(value)) && value.length < 15 && !value.includes("[");

            return (
              <div key={fieldId} className="px-3 py-2">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">{label}</p>
                {arrayValues ? (
                  <div className="flex flex-wrap gap-1">
                    {arrayValues.map((v) => (
                      <span key={v} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">
                        {v}
                      </span>
                    ))}
                  </div>
                ) : isUrl ? (
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors truncate"
                  >
                    {value.includes("github.com") ? <Github className="w-3 h-3 shrink-0" /> :
                     value.includes("demo") ? <Monitor className="w-3 h-3 shrink-0" /> :
                     <Globe className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{value}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                ) : isNumber && Number(value) > 100 ? (
                  <span className="text-xs text-foreground">${Number(value).toLocaleString()}</span>
                ) : (
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap line-clamp-4">{value}</p>
                )}
              </div>
            );
          })}
          {fieldEntries.length === 0 && (
            <div className="px-3 py-4 text-center">
              <p className="text-[10px] text-muted-foreground">No application fields found</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick action buttons */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <h4 className="text-[11px] font-medium text-white/50 mb-2">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-2">
          {STAGE_ACTIONS.map((action) => {
            const isCurrentStage = currentStage?.name === action.name;
            const isMoving = movingTo === action.name;
            const colorClasses =
              action.color === "amber" ? "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20" :
              action.color === "blue" ? "bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20" :
              action.color === "green" ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20" :
              "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20";

            return (
              <button
                key={action.name}
                onClick={() => handleQuickAction(action.name)}
                disabled={isCurrentStage || isMoving}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  isCurrentStage ? "opacity-40 cursor-not-allowed" : "",
                  colorClasses
                )}
              >
                {isMoving ? <Loader2 className="w-3 h-3 animate-spin" /> : action.icon}
                {action.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
