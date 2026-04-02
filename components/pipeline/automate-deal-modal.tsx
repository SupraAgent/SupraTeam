"use client";

import * as React from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Deal } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Zap, Play, ArrowRight, Check, Loader2, ChevronRight,
  GitBranch, Mail, MessageSquare, Calendar, Clock, Webhook,
} from "lucide-react";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  category: "built_in" | "custom";
  tags: string[];
  trigger_type: string | null;
  use_count: number;
}

type AutomateDealModalProps = {
  open: boolean;
  onClose: () => void;
  deal: Deal | null;
  templates: WorkflowTemplate[];
  templatesLoading: boolean;
  onWorkflowCreated?: () => void;
};

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  deal_stage_change: GitBranch,
  deal_created: Zap,
  email_received: Mail,
  tg_message: MessageSquare,
  calendar_event: Calendar,
  webhook: Webhook,
  manual: Play,
  scheduled: Clock,
};

function TriggerIcon({ type }: { type: string | null }) {
  const Icon = (type && TRIGGER_ICONS[type]) || Zap;
  return <Icon className="h-4 w-4" />;
}

export function AutomateDealModal({
  open, onClose, deal, templates, templatesLoading, onWorkflowCreated,
}: AutomateDealModalProps) {
  const [appliedTemplateId, setAppliedTemplateId] = React.useState<string | null>(null);
  const [activateLoading, setActivateLoading] = React.useState(false);
  const [createdWorkflowId, setCreatedWorkflowId] = React.useState<string | null>(null);
  // Synchronous guard against double-click (#3)
  const applyingRef = React.useRef(false);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!open) return;
    setAppliedTemplateId(null);
    setCreatedWorkflowId(null);
    setApplyingId(null);
    applyingRef.current = false;
  }, [open]);

  // Sort: deal-related triggers first, then by use_count
  const sorted = React.useMemo(() => {
    const dealTriggers = new Set(["deal_stage_change", "deal_created", "deal_won", "deal_lost"]);
    return [...templates].sort((a, b) => {
      const aMatch = dealTriggers.has(a.trigger_type ?? "") ? 1 : 0;
      const bMatch = dealTriggers.has(b.trigger_type ?? "") ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      return (b.use_count ?? 0) - (a.use_count ?? 0);
    });
  }, [templates]);

  async function handleApply(templateId: string) {
    // Synchronous double-click guard (#3)
    if (applyingRef.current) return;
    applyingRef.current = true;
    setApplyingId(templateId);
    try {
      const res = await fetch(`/api/workflow-templates/${templateId}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal?.id ?? null,
          deal_context: deal ? {
            deal_name: deal.deal_name,
            board_type: deal.board_type,
            stage_id: deal.stage_id,
            stage_name: deal.stage?.name ?? null,
            contact_id: deal.contact_id,
            contact_name: deal.contact?.name ?? null,
            value: deal.value,
          } : null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        if (res.status === 401) {
          toast.error("Session expired — please log in again");
        } else {
          toast.error(errData?.error ?? "Failed to create automation");
        }
        return;
      }
      const data = await res.json();
      const workflowId = data.workflow?.id ?? null;
      setCreatedWorkflowId(workflowId);
      setAppliedTemplateId(templateId);
      if (workflowId && onWorkflowCreated) onWorkflowCreated();
      toast.success("Automation created from template");
    } catch {
      toast.error("Network error — check your connection");
    } finally {
      applyingRef.current = false;
      setApplyingId(null);
    }
  }

  async function handleActivate() {
    if (!createdWorkflowId) return;
    setActivateLoading(true);
    try {
      const res = await fetch(`/api/workflows/${createdWorkflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      });
      if (res.ok) {
        setActivateLoading(false);
        toast.success("Automation activated — it will run on matching triggers");
        onClose();
        return;
      }
      const errData = await res.json().catch(() => null);
      toast.error(errData?.error ?? "Failed to activate");
    } catch {
      toast.error("Network error — check your connection");
    } finally {
      setActivateLoading(false);
    }
  }

  const applied = appliedTemplateId !== null;

  return (
    <Modal open={open} onClose={onClose} title={`Automate "${deal?.deal_name ?? "Deal"}"`} className="max-w-xl">
      {/* Deal context */}
      {deal && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge>{deal.board_type}</Badge>
          {deal.stage?.name && <Badge>{deal.stage.name}</Badge>}
          {deal.contact?.name && <Badge>{deal.contact.name}</Badge>}
          {deal.value != null && deal.value > 0 && (
            <Badge>${Number(deal.value).toLocaleString()}</Badge>
          )}
        </div>
      )}

      {/* Post-apply: next steps */}
      {applied && createdWorkflowId && (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3">
            <div className="rounded-full bg-emerald-500/20 p-1.5 mt-0.5">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="space-y-1 flex-1">
              <p className="text-sm font-medium text-foreground">Automation created</p>
              <p className="text-xs text-muted-foreground">
                The workflow is ready but inactive. Activate it to start running on matching triggers, or customize it first in the builder.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleActivate}
              disabled={activateLoading}
              className="w-full justify-center gap-2"
            >
              {activateLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Activate Now
            </Button>
            <Link
              href={`/automations?workflow=${createdWorkflowId}`}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium",
                "text-foreground hover:bg-white/10 transition-colors"
              )}
            >
              Customize in Builder
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Close — I&apos;ll set it up later
            </button>
          </div>
        </div>
      )}

      {/* Template picker */}
      {!applied && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pick a template to create an automation for this deal, or start from scratch.
          </p>

          {templatesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[340px] overflow-y-auto thin-scroll -mx-1 px-1">
              {sorted.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleApply(t.id)}
                  disabled={applyingId !== null}
                  className={cn(
                    "w-full text-left rounded-xl border border-white/10 p-3 transition-all",
                    "hover:border-primary/30 hover:bg-primary/5",
                    applyingId === t.id && "border-primary/40 bg-primary/10"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "rounded-lg p-2 shrink-0 mt-0.5",
                      t.category === "built_in" ? "bg-primary/10 text-primary" : "bg-white/10 text-muted-foreground"
                    )}>
                      {applyingId === t.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <TriggerIcon type={t.trigger_type} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{t.name}</span>
                        {t.category === "built_in" && (
                          <span className="text-[9px] text-primary/70 bg-primary/10 rounded px-1 py-0.5 shrink-0">
                            BUILT-IN
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>
                      )}
                      {t.tags.length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {t.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-[9px] text-muted-foreground/60 bg-white/5 rounded px-1.5 py-0.5">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-1" />
                  </div>
                </button>
              ))}

              {sorted.length === 0 && !templatesLoading && (
                <div className="text-center py-6 text-xs text-muted-foreground/50">
                  No templates yet. Create one in Automations.
                </div>
              )}
            </div>
          )}

          {/* Create from scratch */}
          <div className="border-t border-white/10 pt-3">
            <Link
              href={deal ? `/automations?deal=${deal.id}` : "/automations"}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium w-full",
                "text-foreground hover:bg-white/10 transition-colors"
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              Create Custom Automation
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
