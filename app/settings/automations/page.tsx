"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  Zap,
  ZapOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";

type AutomationRule = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  condition_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const TRIGGER_TYPES = [
  { value: "stage_change", label: "Stage Change", hint: "When a deal moves to a specific stage" },
  { value: "deal_created", label: "Deal Created", hint: "When a new deal is created" },
  { value: "deal_value_change", label: "Deal Value Change", hint: "When deal value crosses a threshold" },
  { value: "tag_added", label: "Tag Added", hint: "When a tag is added to a deal" },
];

const ACTION_TYPES = [
  { value: "send_telegram", label: "Send Telegram Message", hint: "Send immediately to deal's linked chat" },
  { value: "schedule_message", label: "Schedule Message", hint: "Send after a delay" },
  { value: "create_reminder", label: "Create Reminder", hint: "Add a reminder to the deal" },
];

export default function AutomationsPage() {
  const [rules, setRules] = React.useState<AutomationRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState("");

  // Form state
  const [name, setName] = React.useState("");
  const [triggerType, setTriggerType] = React.useState("stage_change");
  const [triggerConfig, setTriggerConfig] = React.useState<Record<string, string>>({});
  const [conditionBoard, setConditionBoard] = React.useState("");
  const [actionType, setActionType] = React.useState("send_telegram");
  const [actionMessage, setActionMessage] = React.useState("");
  const [actionDelay, setActionDelay] = React.useState("24");

  const fetchRules = React.useCallback(async () => {
    try {
      const res = await fetch("/api/automation-rules");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchRules(); }, [fetchRules]);

  function showMsg(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2000);
  }

  async function handleCreate() {
    if (!name.trim() || !actionMessage.trim()) return;

    const body = {
      name: name.trim(),
      trigger_type: triggerType,
      trigger_config: Object.fromEntries(
        Object.entries(triggerConfig).filter(([, v]) => v.trim())
      ),
      condition_config: conditionBoard ? { board_type: conditionBoard } : {},
      action_type: actionType,
      action_config: {
        message: actionMessage,
        ...(actionType !== "send_telegram" ? { delay_hours: Number(actionDelay) } : {}),
      },
    };

    const res = await fetch("/api/automation-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      showMsg("Rule created");
      setShowForm(false);
      resetForm();
      fetchRules();
    }
  }

  async function toggleRule(id: string, isActive: boolean) {
    await fetch("/api/automation-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !isActive }),
    });
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_active: !isActive } : r))
    );
  }

  async function deleteRule(id: string) {
    await fetch("/api/automation-rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setRules((prev) => prev.filter((r) => r.id !== id));
    showMsg("Rule deleted");
  }

  function resetForm() {
    setName("");
    setTriggerType("stage_change");
    setTriggerConfig({});
    setConditionBoard("");
    setActionType("send_telegram");
    setActionMessage("");
    setActionDelay("24");
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-40 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rules.length} rule{rules.length !== 1 ? "s" : ""}. Auto-trigger Telegram messages, reminders, and follow-ups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-primary">{msg}</span>}
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            New Rule
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">New Automation Rule</h3>

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name (e.g. MOU Signed → notify)"
            className="text-sm"
          />

          <div className="grid grid-cols-2 gap-3">
            {/* Trigger */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">When (trigger)</label>
              <select
                value={triggerType}
                onChange={(e) => { setTriggerType(e.target.value); setTriggerConfig({}); }}
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm"
              >
                {TRIGGER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                {TRIGGER_TYPES.find((t) => t.value === triggerType)?.hint}
              </p>

              {triggerType === "stage_change" && (
                <Input
                  value={triggerConfig.to_stage ?? ""}
                  onChange={(e) => setTriggerConfig({ ...triggerConfig, to_stage: e.target.value })}
                  placeholder="To stage name (e.g. MOU Signed)"
                  className="text-xs"
                />
              )}
              {triggerType === "deal_value_change" && (
                <Input
                  value={triggerConfig.value_gte ?? ""}
                  onChange={(e) => setTriggerConfig({ ...triggerConfig, value_gte: e.target.value })}
                  placeholder="Value >= (e.g. 50000)"
                  className="text-xs"
                  type="number"
                />
              )}
              {triggerType === "tag_added" && (
                <Input
                  value={triggerConfig.tag ?? ""}
                  onChange={(e) => setTriggerConfig({ ...triggerConfig, tag: e.target.value })}
                  placeholder="Tag name (e.g. priority)"
                  className="text-xs"
                />
              )}
            </div>

            {/* Action */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Then (action)</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm"
              >
                {ACTION_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                {ACTION_TYPES.find((a) => a.value === actionType)?.hint}
              </p>

              {actionType !== "send_telegram" && (
                <Input
                  value={actionDelay}
                  onChange={(e) => setActionDelay(e.target.value)}
                  placeholder="Delay (hours)"
                  className="text-xs"
                  type="number"
                />
              )}
            </div>
          </div>

          {/* Condition */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Only if (optional)</label>
            <select
              value={conditionBoard}
              onChange={(e) => setConditionBoard(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm"
            >
              <option value="">Any board</option>
              <option value="BD">BD</option>
              <option value="Marketing">Marketing</option>
              <option value="Admin">Admin</option>
            </select>
          </div>

          {/* Message template */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Message template
            </label>
            <textarea
              value={actionMessage}
              onChange={(e) => setActionMessage(e.target.value)}
              placeholder={"Use {{deal_name}}, {{stage}}, {{board_type}}, {{value}}, {{changed_by}}"}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!name.trim() || !actionMessage.trim()}>
              Create Rule
            </Button>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={cn(
              "rounded-xl border bg-white/[0.035] px-4 py-3 transition-colors",
              rule.is_active ? "border-white/10" : "border-white/5 opacity-50"
            )}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleRule(rule.id, rule.is_active)}
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  rule.is_active ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
                )}
              >
                {rule.is_active ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{rule.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded bg-white/5 px-1.5 py-0.5">
                    {TRIGGER_TYPES.find((t) => t.value === rule.trigger_type)?.label ?? rule.trigger_type}
                  </span>
                  <span>→</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5">
                    {ACTION_TYPES.find((a) => a.value === rule.action_type)?.label ?? rule.action_type}
                  </span>
                  <span className="ml-2">Created {timeAgo(rule.created_at)}</span>
                </div>
              </div>

              <button
                onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                {expanded === rule.id ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              <button
                onClick={() => deleteRule(rule.id)}
                className="text-muted-foreground hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {expanded === rule.id && (
              <div className="mt-3 pl-11 space-y-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Trigger config: </span>
                  {Object.keys(rule.trigger_config).length > 0
                    ? JSON.stringify(rule.trigger_config)
                    : "Any"}
                </div>
                {Object.keys(rule.condition_config).length > 0 && (
                  <div>
                    <span className="font-medium text-foreground">Condition: </span>
                    {JSON.stringify(rule.condition_config)}
                  </div>
                )}
                <div>
                  <span className="font-medium text-foreground">Action config: </span>
                  <pre className="mt-1 rounded bg-white/5 p-2 text-[10px] whitespace-pre-wrap">
                    {JSON.stringify(rule.action_config, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}

        {rules.length === 0 && !showForm && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <Zap className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              No automation rules. Create one to auto-trigger Telegram messages on deal events.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
