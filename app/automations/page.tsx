"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Workflow,
  Zap,
  ZapOff,
  Trash2,
  Clock,
  ArrowRightLeft,
  PlusCircle,
  Mail,
  MessageCircle,
  Calendar,
  Webhook as WebhookIcon,
  Play,
  BookTemplate,
  Sparkles,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import type { Workflow as WorkflowType } from "@/lib/workflow-db-types";

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  category: "built_in" | "custom";
  tags: string[];
  trigger_type: string | null;
  use_count: number;
}

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  deal_stage_change: ArrowRightLeft,
  deal_created: PlusCircle,
  email_received: Mail,
  tg_message: MessageCircle,
  calendar_event: Calendar,
  webhook: WebhookIcon,
  manual: Play,
};

const TRIGGER_LABELS: Record<string, string> = {
  deal_stage_change: "Deal Stage Change",
  deal_created: "Deal Created",
  email_received: "Email Received",
  tg_message: "Telegram Message",
  calendar_event: "Calendar Event",
  webhook: "Webhook",
  manual: "Manual",
};

export default function AutomationsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = React.useState<WorkflowType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [templates, setTemplates] = React.useState<WorkflowTemplate[]>([]);
  const [templateTab, setTemplateTab] = React.useState<"built_in" | "custom">("built_in");
  const [loadingTemplates, setLoadingTemplates] = React.useState(false);

  const fetchWorkflows = React.useCallback(async () => {
    try {
      const res = await fetch("/api/workflows");
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  function showMsg(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2000);
  }

  async function fetchTemplates() {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/workflow-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } finally {
      setLoadingTemplates(false);
    }
  }

  function toggleTemplates() {
    if (!showTemplates) fetchTemplates();
    setShowTemplates(!showTemplates);
  }

  async function useTemplate(templateId: string) {
    const res = await fetch(`/api/workflow-templates/${templateId}/use`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      router.push(`/automations/${data.workflow.id}`);
    }
  }

  async function deleteTemplate(templateId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/workflow-templates/${templateId}`, { method: "DELETE" });
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    showMsg("Template deleted");
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/automations/${data.workflow.id}`);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    showMsg("Workflow deleted");
  }

  async function toggleActive(id: string, isActive: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/workflows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !isActive }),
    });
    setWorkflows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, is_active: !isActive } : w))
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workflows.length} workflow{workflows.length !== 1 ? "s" : ""}. Build visual automation flows with drag & drop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-primary">{msg}</span>}
          <Button size="sm" variant="outline" onClick={() => router.push("/automations/runs")}>
            <Clock className="mr-1 h-3.5 w-3.5" />
            All Runs
          </Button>
          <Button size="sm" variant="outline" onClick={toggleTemplates}>
            <BookTemplate className="mr-1 h-3.5 w-3.5" />
            Templates
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            New Workflow
          </Button>
        </div>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Workflow name (e.g. Deal Won → Notify + Task)"
            className="text-sm flex-1"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); }}>
            Cancel
          </Button>
        </div>
      )}

      {/* Template library */}
      {showTemplates && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="flex items-center gap-1 px-4 py-2.5 border-b border-white/10">
            <button
              onClick={() => setTemplateTab("built_in")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                templateTab === "built_in" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Sparkles className="inline h-3 w-3 mr-1" />
              Pre-built
            </button>
            <button
              onClick={() => setTemplateTab("custom")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                templateTab === "custom" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              My Templates
            </button>
            <button
              onClick={() => setShowTemplates(false)}
              className="ml-auto text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Close
            </button>
          </div>

          {loadingTemplates ? (
            <div className="p-6 text-center">
              <p className="text-xs text-muted-foreground/50">Loading templates...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {templates
                .filter((t) => t.category === templateTab)
                .map((t) => {
                  const TriggerIcon = TRIGGER_ICONS[t.trigger_type ?? ""] ?? Workflow;
                  return (
                    <div
                      key={t.id}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.035] p-4 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                          <TriggerIcon className="h-4.5 w-4.5 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{t.name}</p>
                          {t.description && (
                            <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-2">{t.description}</p>
                          )}
                        </div>
                      </div>

                      {t.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {t.tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.06] text-[9px] text-muted-foreground">
                              <Hash className="h-2 w-2" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => useTemplate(t.id)}
                        >
                          Use Template
                        </Button>
                        <span className="text-[9px] text-muted-foreground/40">
                          Used {t.use_count} time{t.use_count !== 1 ? "s" : ""}
                        </span>
                        {t.category === "custom" && (
                          <button
                            onClick={(e) => deleteTemplate(t.id, e)}
                            className="ml-auto h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

              {templates.filter((t) => t.category === templateTab).length === 0 && (
                <div className="col-span-full py-6 text-center">
                  <p className="text-xs text-muted-foreground/50">
                    {templateTab === "custom" ? "No saved templates yet. Save a workflow as a template from the editor." : "No built-in templates available."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Workflow grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {workflows.map((wf) => {
          const TriggerIcon = TRIGGER_ICONS[wf.trigger_type ?? ""] ?? Workflow;
          const triggerLabel = TRIGGER_LABELS[wf.trigger_type ?? ""] ?? "No trigger";

          return (
            <div
              key={wf.id}
              onClick={() => router.push(`/automations/${wf.id}`)}
              className={cn(
                "rounded-xl border bg-white/[0.035] p-4 cursor-pointer hover:bg-white/[0.06] transition-colors group",
                wf.is_active ? "border-white/10" : "border-white/5 opacity-60"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <TriggerIcon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{wf.name}</p>
                    <p className="text-[10px] text-muted-foreground">{triggerLabel}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => toggleActive(wf.id, wf.is_active, e)}
                    className={cn(
                      "h-7 w-7 rounded-lg flex items-center justify-center transition-colors",
                      wf.is_active ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    {wf.is_active ? <Zap className="h-3.5 w-3.5" /> : <ZapOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={(e) => handleDelete(wf.id, e)}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {wf.description && (
                <p className="mt-2 text-xs text-muted-foreground/60 line-clamp-2">{wf.description}</p>
              )}

              <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground/50">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {wf.last_run_at ? timeAgo(wf.last_run_at) : "Never run"}
                </span>
                <span>{wf.run_count} run{wf.run_count !== 1 ? "s" : ""}</span>
                <span className="ml-auto">Updated {timeAgo(wf.updated_at)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {workflows.length === 0 && !creating && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-12 text-center">
          <Workflow className="mx-auto h-10 w-10 text-muted-foreground/20" />
          <p className="mt-3 text-sm text-muted-foreground">
            No workflows yet. Create one to build visual automation flows.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/50">
            Drag trigger, action, and logic nodes to create multi-step automations.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Create First Workflow
          </Button>
        </div>
      )}
    </div>
  );
}
