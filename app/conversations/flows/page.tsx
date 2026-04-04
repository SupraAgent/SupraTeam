"use client";

import * as React from "react";
import { Plus, Bot, Play, Pause, Trash2, BarChart3, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatbotFlowCanvas } from "@/components/chatbot-flows/chatbot-flow-canvas";
import type { ChatbotFlow, ChatbotTriggerType } from "@/components/chatbot-flows/types";
import type { Edge, Node } from "@xyflow/react";

type ViewMode = "list" | "canvas" | "analytics";

interface FlowWithStats extends ChatbotFlow {
  stats?: {
    total_runs: number;
    completed_runs: number;
    escalated_runs: number;
    avg_completion_time_seconds: number;
    conversion_rate: number;
  };
}

function mapFlowRow(row: Record<string, unknown>): FlowWithStats {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    triggerType: (row.trigger_type as ChatbotTriggerType) ?? "dm_start",
    triggerKeywords: (row.trigger_keywords as string[]) ?? [],
    isActive: (row.is_active as boolean) ?? false,
    priority: (row.priority as number) ?? 0,
    targetGroups: (row.target_groups as number[]) ?? [],
    nodes: ((row.flow_data as Record<string, unknown>)?.nodes as ChatbotFlow["nodes"]) ?? [],
    edges: ((row.flow_data as Record<string, unknown>)?.edges as ChatbotFlow["edges"]) ?? [],
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
    stats: row.stats as FlowWithStats["stats"],
  };
}

export default function ChatbotFlowsPage() {
  const [view, setView] = React.useState<ViewMode>("list");
  const [flows, setFlows] = React.useState<FlowWithStats[]>([]);
  const [editingFlow, setEditingFlow] = React.useState<ChatbotFlow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [analyticsFlowId, setAnalyticsFlowId] = React.useState<string | null>(null);

  React.useEffect(() => { fetchFlows(); }, []);

  async function fetchFlows() {
    try {
      const res = await fetch("/api/chatbot-flows");
      if (res.ok) {
        const json = await res.json();
        const rawFlows = (json.data ?? []) as Record<string, unknown>[];
        setFlows(rawFlows.map(mapFlowRow));
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(data: {
    name: string;
    description: string;
    triggerType: ChatbotTriggerType;
    triggerKeywords: string[];
    nodes: Node[];
    edges: Edge[];
  }) {
    setSaving(true);
    try {
      const method = editingFlow ? "PUT" : "POST";
      const body = {
        ...(editingFlow ? { id: editingFlow.id } : {}),
        name: data.name,
        description: data.description,
        trigger_type: data.triggerType,
        trigger_keywords: data.triggerKeywords,
        flow_data: { nodes: data.nodes, edges: data.edges },
      };
      const res = await fetch("/api/chatbot-flows", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchFlows();
        setView("list");
        setEditingFlow(null);
      }
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch("/api/chatbot-flows", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !isActive }),
    });
    await fetchFlows();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/chatbot-flows?id=${id}`, { method: "DELETE" });
    await fetchFlows();
  }

  const triggerLabels: Record<string, string> = {
    dm_start: "DM Start",
    group_mention: "Group Mention",
    keyword: "Keyword",
    all_messages: "All Messages",
  };

  if (view === "canvas") {
    return (
      <div className="h-[calc(100vh-3.5rem)]">
        <ChatbotFlowCanvas
          flow={editingFlow}
          onSave={handleSave}
          onBack={() => { setView("list"); setEditingFlow(null); }}
          saving={saving}
        />
      </div>
    );
  }

  if (view === "analytics") {
    const flow = flows.find((f) => f.id === analyticsFlowId);
    const stats = flow?.stats;

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView("list"); setAnalyticsFlowId(null); }}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{flow?.name ?? "Flow"} Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {flow?.description || "Performance metrics for this chatbot flow"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase">Total Runs</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{stats?.total_runs ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase">Completed</p>
            <p className="text-2xl font-semibold text-emerald-400 mt-1">{stats?.completed_runs ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase">Escalated</p>
            <p className="text-2xl font-semibold text-red-400 mt-1">{stats?.escalated_runs ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase">Conversion Rate</p>
            <p className="text-2xl font-semibold text-foreground mt-1">
              {stats?.conversion_rate ? `${Number(stats.conversion_rate).toFixed(1)}%` : "0%"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs font-medium text-foreground mb-2">Avg. Completion Time</p>
          <p className="text-lg text-muted-foreground">
            {stats?.avg_completion_time_seconds
              ? stats.avg_completion_time_seconds < 60
                ? `${stats.avg_completion_time_seconds}s`
                : stats.avg_completion_time_seconds < 3600
                  ? `${Math.round(stats.avg_completion_time_seconds / 60)}m`
                  : `${(stats.avg_completion_time_seconds / 3600).toFixed(1)}h`
              : "N/A"}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs font-medium text-foreground mb-2">Flow Configuration</p>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>Trigger: <span className="text-foreground">{triggerLabels[flow?.triggerType ?? ""] ?? flow?.triggerType}</span></p>
            {flow?.triggerKeywords && flow.triggerKeywords.length > 0 && (
              <p>Keywords: <span className="text-foreground">{flow.triggerKeywords.join(", ")}</span></p>
            )}
            <p>Status: <span className={flow?.isActive ? "text-emerald-400" : "text-muted-foreground"}>{flow?.isActive ? "Active" : "Inactive"}</span></p>
            <p>Nodes: <span className="text-foreground">{flow?.nodes.length ?? 0}</span></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chatbot Decision Trees</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visual conversation flows for lead qualification, FAQ, and routing
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditingFlow(null); setView("canvas"); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Flow
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading flows...</div>
      ) : flows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
          <Bot className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No chatbot flows yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Create a decision tree to auto-qualify leads from Telegram</p>
          <Button size="sm" className="mt-4" onClick={() => { setEditingFlow(null); setView("canvas"); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create Flow
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {flows.map((flow) => {
            const stats = flow.stats;
            return (
              <div key={flow.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex items-center gap-4">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${flow.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-muted-foreground"}`}>
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{flow.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                      {triggerLabels[flow.triggerType] ?? flow.triggerType}
                    </span>
                    {flow.triggerKeywords.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/60 truncate">
                        {flow.triggerKeywords.slice(0, 3).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-xs text-muted-foreground shrink-0">
                  <div className="text-center">
                    <p className="text-foreground font-medium">{stats?.total_runs ?? 0}</p>
                    <p className="text-[10px]">Runs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-foreground font-medium">{stats?.completed_runs ?? 0}</p>
                    <p className="text-[10px]">Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-foreground font-medium">
                      {stats?.conversion_rate ? `${Number(stats.conversion_rate).toFixed(0)}%` : "0%"}
                    </p>
                    <p className="text-[10px]">Conversion</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setAnalyticsFlowId(flow.id); setView("analytics"); }}
                    className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground"
                    title="Analytics"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setEditingFlow(flow); setView("canvas"); }}
                    className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground"
                    title="Edit"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleToggle(flow.id, flow.isActive)}
                    className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground"
                    title={flow.isActive ? "Deactivate" : "Activate"}
                  >
                    {flow.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleDelete(flow.id)}
                    className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
