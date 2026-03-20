"use client";

import * as React from "react";
import type { Node } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type {
  WorkflowNodeData,
  TriggerNodeData,
  ActionNodeData,
  ConditionNodeData,
  DelayNodeData,
} from "@/lib/workflow-types";

interface NodeConfigPanelProps {
  node: Node;
  onDataChange: (nodeId: string, data: WorkflowNodeData) => void;
  onDelete: (nodeId: string) => void;
}

export function NodeConfigPanel({ node, onDataChange, onDelete }: NodeConfigPanelProps) {
  const data = node.data as unknown as WorkflowNodeData;

  function update(partial: Partial<WorkflowNodeData>) {
    onDataChange(node.id, { ...data, ...partial } as WorkflowNodeData);
  }

  function updateConfig(key: string, value: unknown) {
    onDataChange(node.id, {
      ...data,
      config: { ...(data.config as Record<string, unknown>), [key]: value },
    } as unknown as WorkflowNodeData);
  }

  const accentMap: Record<string, string> = {
    trigger: "text-purple-400",
    action: "text-blue-400",
    condition: "text-yellow-400",
    delay: "text-gray-400",
  };

  return (
    <div className="w-72 shrink-0 border-l border-white/10 bg-white/[0.02] p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wider ${accentMap[data.nodeType] ?? "text-foreground"}`}>
          {data.nodeType} Config
        </p>
      </div>

      {/* Label */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">Label</label>
        <Input
          value={data.label}
          onChange={(e) => update({ label: e.target.value })}
          className="text-xs h-8"
          placeholder="Node label"
        />
      </div>

      {/* Type-specific config */}
      {data.nodeType === "trigger" && <TriggerConfig data={data} updateConfig={updateConfig} />}
      {data.nodeType === "action" && <ActionConfig data={data} updateConfig={updateConfig} />}
      {data.nodeType === "condition" && <ConditionConfig data={data} updateConfig={updateConfig} />}
      {data.nodeType === "delay" && <DelayConfig data={data} updateConfig={updateConfig} />}

      <div className="pt-3 border-t border-white/10">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(node.id)}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full justify-start text-xs"
        >
          <Trash2 className="mr-2 h-3 w-3" />
          Delete Node
        </Button>
      </div>
    </div>
  );
}

// ── Trigger config ───────────────────────────────────────────────

function TriggerConfig({ data, updateConfig }: { data: TriggerNodeData; updateConfig: (k: string, v: unknown) => void }) {
  const t = data.triggerType;
  const cfg = data.config as unknown as Record<string, string>;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 px-3 py-2">
        <p className="text-[10px] text-purple-400/80">Type: {t.replace(/_/g, " ")}</p>
      </div>

      {t === "deal_stage_change" && (
        <>
          <Field label="From stage (optional)">
            <Input
              value={cfg.from_stage ?? ""}
              onChange={(e) => updateConfig("from_stage", e.target.value)}
              className="text-xs h-8"
              placeholder="Any stage"
            />
          </Field>
          <Field label="To stage (optional)">
            <Input
              value={cfg.to_stage ?? ""}
              onChange={(e) => updateConfig("to_stage", e.target.value)}
              className="text-xs h-8"
              placeholder="Any stage"
            />
          </Field>
          <Field label="Board type (optional)">
            <select
              value={cfg.board_type ?? ""}
              onChange={(e) => updateConfig("board_type", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs"
            >
              <option value="">Any</option>
              <option value="BD">BD</option>
              <option value="Marketing">Marketing</option>
              <option value="Admin">Admin</option>
            </select>
          </Field>
        </>
      )}

      {t === "deal_created" && (
        <Field label="Board type (optional)">
          <select
            value={cfg.board_type ?? ""}
            onChange={(e) => updateConfig("board_type", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs"
          >
            <option value="">Any</option>
            <option value="BD">BD</option>
            <option value="Marketing">Marketing</option>
            <option value="Admin">Admin</option>
          </select>
        </Field>
      )}

      {t === "email_received" && (
        <>
          <Field label="From contains">
            <Input
              value={cfg.from_contains ?? ""}
              onChange={(e) => updateConfig("from_contains", e.target.value)}
              className="text-xs h-8"
              placeholder="e.g. @supra.com"
            />
          </Field>
          <Field label="Subject contains">
            <Input
              value={cfg.subject_contains ?? ""}
              onChange={(e) => updateConfig("subject_contains", e.target.value)}
              className="text-xs h-8"
              placeholder="e.g. Partnership"
            />
          </Field>
        </>
      )}

      {t === "tg_message" && (
        <>
          <Field label="Chat ID (optional)">
            <Input
              value={cfg.chat_id ?? ""}
              onChange={(e) => updateConfig("chat_id", e.target.value)}
              className="text-xs h-8"
              placeholder="Any chat"
            />
          </Field>
          <Field label="Keyword match">
            <Input
              value={cfg.keyword ?? ""}
              onChange={(e) => updateConfig("keyword", e.target.value)}
              className="text-xs h-8"
              placeholder="e.g. interested"
            />
          </Field>
        </>
      )}

      {t === "calendar_event" && (
        <>
          <Field label="Event type">
            <select
              value={cfg.event_type ?? "upcoming"}
              onChange={(e) => updateConfig("event_type", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs"
            >
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="upcoming">Upcoming</option>
            </select>
          </Field>
          <Field label="Minutes before (for upcoming)">
            <Input
              value={cfg.minutes_before ?? "15"}
              onChange={(e) => updateConfig("minutes_before", Number(e.target.value))}
              className="text-xs h-8"
              type="number"
            />
          </Field>
        </>
      )}

      {t === "webhook" && (
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">
            Webhook URL will be generated after saving.
          </p>
        </div>
      )}

      {t === "manual" && (
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">
            Click "Run" to trigger this workflow manually.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Action config ────────────────────────────────────────────────

function ActionConfig({ data, updateConfig }: { data: ActionNodeData; updateConfig: (k: string, v: unknown) => void }) {
  const t = data.actionType;
  const cfg = data.config as unknown as Record<string, string>;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 px-3 py-2">
        <p className="text-[10px] text-blue-400/80">Type: {t.replace(/_/g, " ")}</p>
      </div>

      {t === "send_telegram" && (
        <>
          <Field label="Message template">
            <textarea
              value={cfg.message ?? ""}
              onChange={(e) => updateConfig("message", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs resize-none"
              rows={4}
              placeholder={"Use {{deal_name}}, {{stage}}, {{value}}"}
            />
          </Field>
          <Field label="Chat ID override (optional)">
            <Input
              value={cfg.chat_id ?? ""}
              onChange={(e) => updateConfig("chat_id", e.target.value)}
              className="text-xs h-8"
              placeholder="Default: deal's linked chat"
            />
          </Field>
        </>
      )}

      {t === "send_email" && (
        <>
          <Field label="To (optional override)">
            <Input
              value={cfg.to ?? ""}
              onChange={(e) => updateConfig("to", e.target.value)}
              className="text-xs h-8"
              placeholder="Default: contact email"
            />
          </Field>
          <Field label="Subject">
            <Input
              value={cfg.subject ?? ""}
              onChange={(e) => updateConfig("subject", e.target.value)}
              className="text-xs h-8"
              placeholder="Email subject"
            />
          </Field>
          <Field label="Body">
            <textarea
              value={cfg.body ?? ""}
              onChange={(e) => updateConfig("body", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs resize-none"
              rows={4}
              placeholder="Email body…"
            />
          </Field>
        </>
      )}

      {t === "update_deal" && (
        <>
          <Field label="Field">
            <select
              value={cfg.field ?? "stage"}
              onChange={(e) => updateConfig("field", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs"
            >
              <option value="stage">Stage</option>
              <option value="value">Value</option>
              <option value="board_type">Board Type</option>
              <option value="assigned_to">Assigned To</option>
            </select>
          </Field>
          <Field label="New value">
            <Input
              value={cfg.value ?? ""}
              onChange={(e) => updateConfig("value", e.target.value)}
              className="text-xs h-8"
              placeholder="Value…"
            />
          </Field>
        </>
      )}

      {t === "create_task" && (
        <>
          <Field label="Task title">
            <Input
              value={cfg.title ?? ""}
              onChange={(e) => updateConfig("title", e.target.value)}
              className="text-xs h-8"
              placeholder="e.g. Follow up on {{deal_name}}"
            />
          </Field>
          <Field label="Description (optional)">
            <textarea
              value={cfg.description ?? ""}
              onChange={(e) => updateConfig("description", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs resize-none"
              rows={2}
              placeholder="Task details…"
            />
          </Field>
          <Field label="Due in (hours)">
            <Input
              value={cfg.due_hours ?? "24"}
              onChange={(e) => updateConfig("due_hours", Number(e.target.value))}
              className="text-xs h-8"
              type="number"
            />
          </Field>
        </>
      )}
    </div>
  );
}

// ── Condition config ─────────────────────────────────────────────

function ConditionConfig({ data, updateConfig }: { data: ConditionNodeData; updateConfig: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 px-3 py-2">
        <p className="text-[10px] text-yellow-400/80">If / Else Branch</p>
      </div>

      <Field label="Deal field">
        <select
          value={data.config.field ?? "board_type"}
          onChange={(e) => updateConfig("field", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs"
        >
          <option value="board_type">Board Type</option>
          <option value="stage">Stage</option>
          <option value="value">Value</option>
          <option value="assigned_to">Assigned To</option>
          <option value="company">Company</option>
          <option value="tags">Tags</option>
        </select>
      </Field>

      <Field label="Operator">
        <select
          value={data.config.operator ?? "equals"}
          onChange={(e) => updateConfig("operator", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs"
        >
          <option value="equals">Equals</option>
          <option value="not_equals">Not Equals</option>
          <option value="contains">Contains</option>
          <option value="gt">Greater Than</option>
          <option value="lt">Less Than</option>
          <option value="gte">Greater or Equal</option>
          <option value="lte">Less or Equal</option>
          <option value="is_empty">Is Empty</option>
          <option value="is_not_empty">Is Not Empty</option>
        </select>
      </Field>

      <Field label="Value">
        <Input
          value={data.config.value ?? ""}
          onChange={(e) => updateConfig("value", e.target.value)}
          className="text-xs h-8"
          placeholder="Compare value…"
        />
      </Field>

      <div className="flex gap-2 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> True path
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-400" /> False path
        </span>
      </div>
    </div>
  );
}

// ── Delay config ─────────────────────────────────────────────────

function DelayConfig({ data, updateConfig }: { data: DelayNodeData; updateConfig: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
        <p className="text-[10px] text-muted-foreground">Wait before continuing</p>
      </div>

      <Field label="Duration">
        <Input
          value={String(data.config.duration ?? 1)}
          onChange={(e) => updateConfig("duration", Number(e.target.value))}
          className="text-xs h-8"
          type="number"
          min={1}
        />
      </Field>

      <Field label="Unit">
        <select
          value={data.config.unit ?? "hours"}
          onChange={(e) => updateConfig("unit", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs"
        >
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </Field>
    </div>
  );
}

// ── Shared field wrapper ─────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
