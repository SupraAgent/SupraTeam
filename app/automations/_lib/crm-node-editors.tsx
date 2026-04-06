"use client";

import React from "react";
import type { CustomNodeEditor } from "@supra/loop-builder";
import type { CrmTriggerNodeData } from "../_nodes/crm-trigger-node";
import type { CrmActionNodeData, RetryConfig } from "../_nodes/crm-action-node";
import type { CrmConditionNodeData, CrmConditionRule } from "../_nodes/crm-condition-node";
import type { CrmLoopNodeData } from "../_nodes/crm-loop-node";
import type { CrmMergeNodeData } from "../_nodes/crm-merge-node";
import type { CrmSubworkflowNodeData } from "../_nodes/crm-subworkflow-node";
import { VariableTextarea, VariableInput } from "./variable-picker";

const inputClass =
  "w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";
const selectClass =
  "w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none";
const labelClass = "text-[11px] font-medium text-muted-foreground mb-1 block";

// ── Async Options Hook ─────────────────────────────────────

interface CrmOption {
  value: string;
  label: string;
  meta?: Record<string, unknown>;
}

function useCrmOptions(type: string, params?: Record<string, string>, enabled = true) {
  const [options, setOptions] = React.useState<CrmOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const paramsKey = params ? JSON.stringify(params) : "";

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ type, ...params });
    fetch(`/api/loop/crm-options?${qs}`)
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((data) => {
        if (!cancelled) setOptions(data.options ?? []);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [type, paramsKey, enabled]);

  return { options, loading };
}

/** Reusable async select component */
function AsyncSelect({
  label: selectLabel,
  options,
  loading,
  value,
  onChange,
  placeholder,
  onSearch,
}: {
  label: string;
  options: CrmOption[];
  loading: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSearch?: (q: string) => void;
}) {
  return (
    <div>
      <label className={labelClass}>{selectLabel}</label>
      {onSearch && (
        <input
          className={`${inputClass} mb-1`}
          placeholder="Search..."
          onChange={(e) => onSearch(e.target.value)}
        />
      )}
      <select
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{loading ? "Loading..." : (placeholder || "Select...")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/** Searchable combobox — auto-upgrades from plain select when options >= 5 */
function Combobox({
  label: comboLabel,
  options,
  loading,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  options: CrmOption[];
  loading: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [manualMode, setManualMode] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  );
  const selectedLabel = options.find((o) => o.value === value)?.label;

  if (manualMode) {
    return (
      <div>
        <label className={labelClass}>{comboLabel}</label>
        <input
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter ID manually..."
        />
        <button onClick={() => setManualMode(false)} className="text-[10px] text-primary/60 hover:text-primary mt-1 transition">
          Back to list
        </button>
      </div>
    );
  }

  // For small lists, use plain select
  if (options.length < 5 && !loading) {
    return (
      <div>
        <label className={labelClass}>{comboLabel}</label>
        <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{placeholder || "Select..."}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <label className={labelClass}>{comboLabel}</label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className={`${selectClass} text-left flex items-center justify-between`}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {loading ? "Loading..." : selectedLabel || placeholder || "Select..."}
        </span>
        <svg className="w-3 h-3 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-white/10 bg-background shadow-xl max-h-48 overflow-hidden">
          <input
            autoFocus
            className="w-full border-b border-white/10 bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
          />
          <div className="max-h-36 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-[10px] text-muted-foreground">No matches</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-white/5 transition ${o.value === value ? "bg-primary/10 text-primary" : "text-foreground"}`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => { setManualMode(true); setOpen(false); }}
            className="w-full text-left px-2.5 py-1.5 text-[10px] text-muted-foreground hover:bg-white/5 border-t border-white/10 transition"
          >
            Enter ID manually...
          </button>
        </div>
      )}
    </div>
  );
}

/** Multi-select with tag chips — supports both static and async options */
function MultiSelect({
  label: multiLabel,
  options,
  loading,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  options: CrmOption[];
  loading: boolean;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter(
    (o) => !values.includes(o.value) && (o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()))
  );
  const selectedOptions = values.map((v) => options.find((o) => o.value === v) || { value: v, label: v });

  function addValue(val: string) {
    if (!values.includes(val)) onChange([...values, val]);
  }
  function removeValue(val: string) {
    onChange(values.filter((v) => v !== val));
  }

  return (
    <div ref={ref} className="relative">
      <label className={labelClass}>{multiLabel}</label>
      {/* Selected tags */}
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {selectedOptions.map((o) => (
            <span key={o.value} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
              {o.label}
              <button type="button" onClick={() => removeValue(o.value)} className="hover:text-red-400 transition">&#x2715;</button>
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className={`${selectClass} text-left`}
      >
        <span className="text-muted-foreground">
          {loading ? "Loading..." : placeholder || "Add..."}
        </span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-white/10 bg-background shadow-xl max-h-48 overflow-hidden">
          <input
            autoFocus
            className="w-full border-b border-white/10 bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
          />
          <div className="max-h-36 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-[10px] text-muted-foreground">No more options</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { addValue(o.value); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-foreground hover:bg-white/5 transition"
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Free-form tag input — type and press Enter to add values */
function TagInput({
  label: tagLabel,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = React.useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      if (!values.includes(input.trim())) {
        onChange([...values, input.trim()]);
      }
      setInput("");
    } else if (e.key === "Backspace" && !input && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div>
      <label className={labelClass}>{tagLabel}</label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="hover:text-red-400 transition">&#x2715;</button>
            </span>
          ))}
        </div>
      )}
      <input
        className={inputClass}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Type and press Enter..."}
      />
    </div>
  );
}

// ── CRM Trigger Editor ──────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: "deal_stage_change", label: "Deal Stage Change" },
  { value: "deal_created", label: "Deal Created" },
  { value: "deal_won", label: "Deal Won" },
  { value: "deal_lost", label: "Deal Lost" },
  { value: "deal_stale", label: "Deal Stale" },
  { value: "deal_value_change", label: "Deal Value Change" },
  { value: "contact_created", label: "Contact Created" },
  { value: "task_overdue", label: "Task Overdue" },
  { value: "tg_message", label: "TG Message" },
  { value: "tg_member_joined", label: "TG Member Joined" },
  { value: "tg_member_left", label: "TG Member Left" },
  { value: "email_received", label: "Email Received" },
  { value: "calendar_event", label: "Calendar Event" },
  { value: "webhook", label: "Webhook" },
  { value: "manual", label: "Manual" },
  { value: "lead_qualified", label: "Lead Qualified" },
  { value: "scheduled", label: "Scheduled" },
  { value: "bot_dm_received", label: "Bot DM Received" },
] as const;

const CrmTriggerEditor: CustomNodeEditor = ({ data, onChange }) => {
  const d = data as Partial<CrmTriggerNodeData>;
  const config = (d.config ?? {}) as Record<string, string>;
  const needsStages = d.crmTrigger === "deal_stage_change";
  const needsGroups = d.crmTrigger === "tg_message" || d.crmTrigger === "tg_member_joined" || d.crmTrigger === "tg_member_left";
  const { options: stageOptions, loading: stagesLoading } = useCrmOptions("stages", undefined, needsStages);
  const { options: groupOptions, loading: groupsLoading } = useCrmOptions("groups", undefined, needsGroups);

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Label</label>
        <input
          className={inputClass}
          value={(d.label as string) || ""}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Node label"
        />
      </div>
      <div>
        <label className={labelClass}>Trigger Type</label>
        <select
          className={selectClass}
          value={d.crmTrigger || "deal_stage_change"}
          onChange={(e) => onChange({ crmTrigger: e.target.value })}
        >
          {TRIGGER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {d.crmTrigger === "deal_stage_change" && (
        <Combobox
          label="Stage Filter (optional)"
          options={stageOptions}
          loading={stagesLoading}
          value={config.stage_name || ""}
          onChange={(v) => onChange({ config: { ...config, stage_name: v } })}
          placeholder="Any stage"
        />
      )}
      {d.crmTrigger === "deal_stale" && (
        <div>
          <label className={labelClass}>Days of Inactivity</label>
          <input
            className={inputClass}
            type="number"
            min="1"
            value={config.stale_days || "7"}
            onChange={(e) => onChange({ config: { ...config, stale_days: e.target.value } })}
            placeholder="7"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Trigger when a deal has no activity for this many days</p>
        </div>
      )}
      {d.crmTrigger === "deal_created" && (
        <Combobox
          label="Board Filter (optional)"
          options={[{ value: "BD", label: "BD" }, { value: "Marketing", label: "Marketing" }, { value: "Admin", label: "Admin" }]}
          loading={false}
          value={config.board_type || ""}
          onChange={(v) => onChange({ config: { ...config, board_type: v } })}
          placeholder="Any board"
        />
      )}
      {d.crmTrigger === "scheduled" && (
        <div>
          <label className={labelClass}>Schedule (cron)</label>
          <input
            className={inputClass}
            value={config.cron || ""}
            onChange={(e) => onChange({ config: { ...config, cron: e.target.value } })}
            placeholder="e.g. 0 9 * * 1-5"
          />
        </div>
      )}
      {d.crmTrigger === "webhook" && (
        <>
          {config.webhook_url ? (
            <div>
              <label className={labelClass}>Webhook URL</label>
              <div className="flex items-center gap-1">
                <input
                  className={`${inputClass} font-mono text-[10px]`}
                  value={config.webhook_url}
                  readOnly
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(config.webhook_url)}
                  className="shrink-0 px-2 py-1.5 rounded bg-white/5 text-[10px] text-muted-foreground hover:text-foreground transition"
                >
                  Copy
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                POST to this URL to trigger the workflow
              </p>
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground bg-white/5 rounded-md p-2">
              Save the workflow to generate a webhook URL
            </div>
          )}
          <div>
            <label className={labelClass}>Webhook Secret (optional)</label>
            <input
              className={inputClass}
              value={config.webhook_secret || ""}
              onChange={(e) => onChange({ config: { ...config, webhook_secret: e.target.value } })}
              placeholder="Optional secret for x-webhook-secret header validation"
            />
          </div>
          {config.last_webhook_payload && (
            <div>
              <label className={labelClass}>Last Received Payload</label>
              <pre className="text-[10px] text-muted-foreground bg-white/5 rounded-md p-2 max-h-24 overflow-auto font-mono whitespace-pre-wrap">
                {typeof config.last_webhook_payload === "string"
                  ? config.last_webhook_payload
                  : JSON.stringify(config.last_webhook_payload, null, 2)}
              </pre>
            </div>
          )}
          <button
            type="button"
            onClick={async () => {
              if (!config.webhook_url) return;
              try {
                const headers: Record<string, string> = { "Content-Type": "application/json" };
                if (config.webhook_secret) headers["x-webhook-secret"] = config.webhook_secret;
                await fetch(config.webhook_url, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ test: true, timestamp: new Date().toISOString() }),
                });
              } catch {
                /* ignore -- will show in last payload on next load */
              }
            }}
            disabled={!config.webhook_url}
            className="w-full rounded-md border border-dashed border-white/10 py-1.5 text-[11px] text-muted-foreground hover:border-white/20 hover:text-foreground transition-colors disabled:opacity-50"
          >
            Send Test Payload
          </button>
        </>
      )}
      {(d.crmTrigger === "tg_message" || d.crmTrigger === "tg_member_joined" || d.crmTrigger === "tg_member_left") && (
        <>
          <Combobox
            label="Group Filter (optional)"
            options={groupOptions}
            loading={groupsLoading}
            value={config.group_id || ""}
            onChange={(v) => onChange({ config: { ...config, group_id: v } })}
            placeholder="Any group"
          />
          <div>
            <label className={labelClass}>Recent Messages to Fetch</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              max="50"
              value={config.recent_message_count || "10"}
              onChange={(e) => onChange({ config: { ...config, recent_message_count: e.target.value } })}
              placeholder="10"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Fetch last N messages as context (available as {"{{recent_messages}}"}, {"{{last_sender}}"})
            </p>
          </div>
        </>
      )}
    </div>
  );
};

// ── TG Inline Buttons Editor ────────────────────────────────

interface TgInlineButton {
  text: string;
  callback_data: string;
}

function TgInlineButtonsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  let buttons: TgInlineButton[] = [];
  try {
    buttons = JSON.parse(value);
    if (!Array.isArray(buttons)) buttons = [];
  } catch {
    buttons = [];
  }

  function update(next: TgInlineButton[]) {
    onChange(JSON.stringify(next));
  }

  function addButton() {
    if (buttons.length >= 8) return;
    update([...buttons, { text: "", callback_data: "" }]);
  }

  function removeButton(idx: number) {
    update(buttons.filter((_, i) => i !== idx));
  }

  function updateButton(idx: number, field: keyof TgInlineButton, val: string) {
    const next = buttons.map((b, i) => (i === idx ? { ...b, [field]: val } : b));
    update(next);
  }

  return (
    <div className="space-y-2">
      {buttons.map((btn, idx) => (
        <div key={idx} className="flex items-start gap-1.5">
          <div className="flex-1 space-y-1">
            <input
              className={inputClass}
              value={btn.text}
              onChange={(e) => updateButton(idx, "text", e.target.value)}
              placeholder="Button label"
            />
            <input
              className={inputClass}
              value={btn.callback_data}
              onChange={(e) => updateButton(idx, "callback_data", e.target.value)}
              placeholder="Callback data"
            />
          </div>
          <button
            type="button"
            onClick={() => removeButton(idx)}
            className="mt-1 shrink-0 text-[10px] text-red-400 hover:text-red-300 transition-colors"
          >
            Remove
          </button>
        </div>
      ))}
      {buttons.length < 8 && (
        <button
          type="button"
          onClick={addButton}
          className="text-[11px] text-primary/70 hover:text-primary transition-colors"
        >
          + Add Button
        </button>
      )}
      {buttons.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No buttons added yet.</p>
      )}
    </div>
  );
}

// ── CRM Action Editor ───────────────────────────────────────

const ACTION_OPTIONS = [
  { value: "send_telegram", label: "Send Telegram" },
  { value: "send_email", label: "Send Email" },
  { value: "send_slack", label: "Send Slack" },
  { value: "send_broadcast", label: "Broadcast" },
  { value: "update_deal", label: "Update Deal" },
  { value: "update_contact", label: "Update Contact" },
  { value: "assign_deal", label: "Assign Deal" },
  { value: "create_deal", label: "Create Deal" },
  { value: "create_task", label: "Create Task" },
  { value: "add_tag", label: "Add Tag" },
  { value: "remove_tag", label: "Remove Tag" },
  { value: "tg_manage_access", label: "TG Access" },
  { value: "ai_summarize", label: "AI Summarize" },
  { value: "ai_classify", label: "AI Classify" },
  { value: "add_to_sequence", label: "Add to Sequence" },
  { value: "remove_from_sequence", label: "Remove from Sequence" },
  { value: "http_request", label: "HTTP Request" },
  { value: "send_tg_buttons", label: "TG Buttons" },
] as const;

const CrmActionEditor: CustomNodeEditor = ({ data, onChange }) => {
  const d = data as Partial<CrmActionNodeData>;
  const config = (d.config ?? {}) as Record<string, string>;
  const crmAction = d.crmAction || "send_telegram";

  // Fetch options lazily — only when the selected action needs them
  const needsGroups = crmAction === "send_telegram" || crmAction === "send_tg_buttons";
  const needsTeam = ["assign_deal", "create_task", "update_deal"].includes(crmAction);
  const needsStages = ["update_deal", "create_deal"].includes(crmAction);
  const needsBoards = ["update_deal", "create_deal"].includes(crmAction);
  const needsSequences = ["add_to_sequence", "remove_from_sequence"].includes(crmAction);
  const needsSlugs = ["send_broadcast", "tg_manage_access"].includes(crmAction);

  const { options: groupOptions, loading: groupsLoading } = useCrmOptions("groups", undefined, needsGroups);
  const { options: teamOptions, loading: teamLoading } = useCrmOptions("team", undefined, needsTeam);
  const { options: stageOptions, loading: stagesLoading } = useCrmOptions("stages", undefined, needsStages);
  const { options: boardOptions } = useCrmOptions("boards", undefined, needsBoards);
  const { options: sequenceOptions, loading: sequencesLoading } = useCrmOptions("sequences", undefined, needsSequences);
  const { options: slugOptions, loading: slugsLoading } = useCrmOptions("slugs", undefined, needsSlugs);

  function updateConfig(key: string, value: string) {
    onChange({ config: { ...config, [key]: value } });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Label</label>
        <input
          className={inputClass}
          value={(d.label as string) || ""}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Node label"
        />
      </div>
      <div>
        <label className={labelClass}>Action Type</label>
        <select
          className={selectClass}
          value={crmAction}
          onChange={(e) => onChange({ crmAction: e.target.value })}
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Action-specific config fields */}
      {(crmAction === "send_telegram" || crmAction === "send_broadcast") && (
        <>
          <div>
            <label className={labelClass}>Message</label>
            <VariableTextarea
              value={config.message || ""}
              onChange={(v) => updateConfig("message", v)}
              placeholder="Message text — type {{ for variables"
            />
          </div>
          {crmAction === "send_telegram" && (
            <Combobox
              label="Chat / Group (optional)"
              options={groupOptions}
              loading={groupsLoading}
              value={config.chat_id || ""}
              onChange={(v) => updateConfig("chat_id", v)}
              placeholder="Use deal's linked chat"
            />
          )}
          {crmAction === "send_broadcast" && (
            <Combobox
              label="Tag Filter"
              options={slugOptions}
              loading={slugsLoading}
              value={config.slug || ""}
              onChange={(v) => updateConfig("slug", v)}
              placeholder="Select tag"
            />
          )}
        </>
      )}

      {crmAction === "send_email" && (
        <>
          <div>
            <label className={labelClass}>To</label>
            <VariableInput
              value={config.to || ""}
              onChange={(v) => updateConfig("to", v)}
              placeholder="Recipient email or type {{ for variables"
            />
          </div>
          <div>
            <label className={labelClass}>Subject</label>
            <VariableInput
              value={config.subject || ""}
              onChange={(v) => updateConfig("subject", v)}
              placeholder="Email subject — type {{ for variables"
            />
          </div>
          <div>
            <label className={labelClass}>Body</label>
            <VariableTextarea
              value={config.body || ""}
              onChange={(v) => updateConfig("body", v)}
              placeholder="Email body — type {{ for variables"
            />
          </div>
        </>
      )}

      {crmAction === "send_slack" && (
        <>
          <div>
            <label className={labelClass}>Channel ID</label>
            <input className={inputClass} value={config.channel_id || ""} onChange={(e) => updateConfig("channel_id", e.target.value)} placeholder="Slack channel ID" />
          </div>
          <div>
            <label className={labelClass}>Message</label>
            <VariableTextarea
              value={config.message || ""}
              onChange={(v) => updateConfig("message", v)}
              placeholder="Slack message — type {{ for variables"
            />
          </div>
        </>
      )}

      {crmAction === "update_deal" && (
        <>
          <div>
            <label className={labelClass}>Field</label>
            <select className={selectClass} value={config.field || ""} onChange={(e) => updateConfig("field", e.target.value)}>
              <option value="">Select field...</option>
              <option value="stage_id">Pipeline Stage</option>
              <option value="board_type">Board</option>
              <option value="value">Deal Value</option>
              <option value="assigned_to">Assigned To</option>
              <option value="notes">Notes</option>
              <option value="priority">Priority</option>
            </select>
          </div>
          {config.field === "stage_id" ? (
            <Combobox
              label="Stage"
              options={stageOptions}
              loading={stagesLoading}
              value={config.value || ""}
              onChange={(v) => updateConfig("value", v)}
              placeholder="Select stage"
            />
          ) : config.field === "board_type" ? (
            <Combobox
              label="Board"
              options={boardOptions}
              loading={false}
              value={config.value || ""}
              onChange={(v) => updateConfig("value", v)}
              placeholder="Select board"
            />
          ) : config.field === "assigned_to" ? (
            <Combobox
              label="Assign To"
              options={teamOptions}
              loading={teamLoading}
              value={config.value || ""}
              onChange={(v) => updateConfig("value", v)}
              placeholder="Select team member"
            />
          ) : (
            <div>
              <label className={labelClass}>Value</label>
              <input className={inputClass} value={config.value || ""} onChange={(e) => updateConfig("value", e.target.value)} placeholder="New value" />
            </div>
          )}
        </>
      )}

      {crmAction === "update_contact" && (
        <>
          <div>
            <label className={labelClass}>Field</label>
            <select className={selectClass} value={config.field || ""} onChange={(e) => updateConfig("field", e.target.value)}>
              <option value="">Select field...</option>
              <option value="name">Name</option>
              <option value="company">Company</option>
              <option value="lifecycle_stage">Lifecycle Stage</option>
              <option value="notes">Notes</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Value</label>
            <input className={inputClass} value={config.value || ""} onChange={(e) => updateConfig("value", e.target.value)} placeholder="New value" />
          </div>
        </>
      )}

      {crmAction === "assign_deal" && (
        <Combobox
          label="Assign To"
          options={teamOptions}
          loading={teamLoading}
          value={config.assign_to || ""}
          onChange={(v) => updateConfig("assign_to", v)}
          placeholder="Select team member"
        />
      )}

      {crmAction === "create_deal" && (
        <>
          <div>
            <label className={labelClass}>Deal Name</label>
            <input className={inputClass} value={config.name || ""} onChange={(e) => updateConfig("name", e.target.value)} placeholder="New deal name" />
          </div>
          <Combobox
            label="Board"
            options={boardOptions}
            loading={false}
            value={config.board_type || "BD"}
            onChange={(v) => updateConfig("board_type", v)}
            placeholder="Select board"
          />
          <Combobox
            label="Initial Stage (optional)"
            options={stageOptions}
            loading={stagesLoading}
            value={config.stage_id || ""}
            onChange={(v) => updateConfig("stage_id", v)}
            placeholder="First stage"
          />
        </>
      )}

      {crmAction === "create_task" && (
        <>
          <div>
            <label className={labelClass}>Title</label>
            <input className={inputClass} value={config.title || ""} onChange={(e) => updateConfig("title", e.target.value)} placeholder="Task title" />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={`${inputClass} min-h-[40px] resize-y`} value={config.description || ""} onChange={(e) => updateConfig("description", e.target.value)} placeholder="Task description" />
          </div>
          <Combobox
            label="Assign To (optional)"
            options={teamOptions}
            loading={teamLoading}
            value={config.assign_to || ""}
            onChange={(v) => updateConfig("assign_to", v)}
            placeholder="Unassigned"
          />
        </>
      )}

      {(crmAction === "add_tag" || crmAction === "remove_tag") && (
        <div>
          <label className={labelClass}>Tag</label>
          <input className={inputClass} value={config.tag || ""} onChange={(e) => updateConfig("tag", e.target.value)} placeholder="Tag name" />
        </div>
      )}

      {crmAction === "http_request" && (
        <>
          <div>
            <label className={labelClass}>URL</label>
            <VariableInput
              value={config.url || ""}
              onChange={(v) => updateConfig("url", v)}
              placeholder="https://api.example.com/webhook — type {{ for variables"
            />
          </div>
          <div>
            <label className={labelClass}>Method</label>
            <select className={selectClass} value={config.method || "GET"} onChange={(e) => updateConfig("method", e.target.value)}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Body (JSON)</label>
            <VariableTextarea
              value={config.body || ""}
              onChange={(v) => updateConfig("body", v)}
              placeholder='{"key": "{{deal_name}}"} — type {{ for variables'
              minHeight="40px"
              mono
            />
          </div>
        </>
      )}

      {crmAction === "ai_summarize" && (
        <>
          <div>
            <label className={labelClass}>Target Entity</label>
            <select className={selectClass} value={config.target || "deal"} onChange={(e) => updateConfig("target", e.target.value)}>
              <option value="deal">Current Deal</option>
              <option value="contact">Contact</option>
              <option value="conversation">Conversation History</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Summary Prompt (optional)</label>
            <textarea className={`${inputClass} min-h-[60px] resize-y`} value={config.prompt || ""} onChange={(e) => updateConfig("prompt", e.target.value)} placeholder="Summarize this deal's status and next steps..." />
          </div>
          <div>
            <label className={labelClass}>Output Format</label>
            <select className={selectClass} value={config.format || "text"} onChange={(e) => updateConfig("format", e.target.value)}>
              <option value="text">Plain Text</option>
              <option value="bullets">Bullet Points</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Max Length (tokens)</label>
            <input className={inputClass} type="number" value={config.max_tokens || "256"} onChange={(e) => updateConfig("max_tokens", e.target.value)} placeholder="256" />
          </div>
        </>
      )}

      {crmAction === "ai_classify" && (
        <TagInput
          label="Categories"
          values={(config.categories || "").split(",").filter(Boolean).map((c) => c.trim())}
          onChange={(vals) => updateConfig("categories", vals.join(","))}
          placeholder="Type and press Enter..."
        />
      )}

      {(crmAction === "add_to_sequence" || crmAction === "remove_from_sequence") && (
        <Combobox
          label="Sequence"
          options={sequenceOptions}
          loading={sequencesLoading}
          value={config.sequence_id || ""}
          onChange={(v) => updateConfig("sequence_id", v)}
          placeholder="Select sequence"
        />
      )}

      {crmAction === "tg_manage_access" && (
        <>
          <Combobox
            label="Tag"
            options={slugOptions}
            loading={slugsLoading}
            value={config.slug || ""}
            onChange={(v) => updateConfig("slug", v)}
            placeholder="Select tag"
          />
          <div>
            <label className={labelClass}>Operation</label>
            <select className={selectClass} value={config.operation || "add"} onChange={(e) => updateConfig("operation", e.target.value)}>
              <option value="add">Add Access</option>
              <option value="remove">Remove Access</option>
            </select>
          </div>
        </>
      )}

      {crmAction === "send_tg_buttons" && (
        <>
          <Combobox
            label="Chat / Group (optional)"
            options={groupOptions}
            loading={groupsLoading}
            value={config.chat_id || ""}
            onChange={(v) => updateConfig("chat_id", v)}
            placeholder="Use deal's linked chat"
          />
          <div>
            <label className={labelClass}>Message</label>
            <VariableTextarea
              value={config.message || ""}
              onChange={(v) => updateConfig("message", v)}
              placeholder="Message text — type {{ for variables"
            />
          </div>
          <div>
            <label className={labelClass}>Inline Buttons (max 8)</label>
            <TgInlineButtonsEditor
              value={config.buttons || "[]"}
              onChange={(v) => updateConfig("buttons", v)}
            />
          </div>
        </>
      )}

      {/* Error Path */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="hasErrorPath"
          checked={!!d.hasErrorPath}
          onChange={(e) => onChange({ hasErrorPath: e.target.checked })}
          className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50"
        />
        <label htmlFor="hasErrorPath" className="text-[11px] text-muted-foreground cursor-pointer">
          Enable error path — route to fallback node on failure
        </label>
      </div>

      {/* Retry Policy */}
      <RetryPolicySection
        retryConfig={d.retryConfig}
        onChange={(rc) => onChange({ retryConfig: rc })}
      />
    </div>
  );
};

// ── Retry Policy Section ──────────────────────────────────────

const RETRY_ERROR_TYPES = [
  { value: "timeout", label: "Timeout" },
  { value: "rate_limit", label: "Rate Limit" },
  { value: "server", label: "Server Error" },
  { value: "unknown", label: "Unknown" },
] as const;

const DEFAULT_RETRY_ON = ["timeout", "rate_limit", "server", "unknown"];

function RetryPolicySection({
  retryConfig,
  onChange,
}: {
  retryConfig?: RetryConfig;
  onChange: (rc: RetryConfig) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const maxRetries = retryConfig?.maxRetries ?? 2;
  const retryDelay = retryConfig?.retryDelay ?? 2000;
  const retryOn = retryConfig?.retryOn ?? DEFAULT_RETRY_ON;

  function update(patch: Partial<RetryConfig>) {
    onChange({
      maxRetries: patch.maxRetries ?? maxRetries,
      retryDelay: patch.retryDelay ?? retryDelay,
      retryOn: patch.retryOn ?? retryOn,
    });
  }

  function toggleRetryOn(errorType: string) {
    const next = retryOn.includes(errorType)
      ? retryOn.filter((t) => t !== errorType)
      : [...retryOn, errorType];
    update({ retryOn: next });
  }

  return (
    <div className="rounded-md border border-white/5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Retry Policy {maxRetries > 0 ? `(${maxRetries}x)` : "(off)"}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-3 border-t border-white/5 pt-2">
          <div>
            <label className={labelClass}>Max Retries (0-5)</label>
            <input
              className={inputClass}
              type="number"
              min={0}
              max={5}
              value={maxRetries}
              onChange={(e) => update({ maxRetries: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })}
            />
          </div>
          <div>
            <label className={labelClass}>Retry Delay (seconds)</label>
            <input
              className={inputClass}
              type="number"
              min={1}
              max={60}
              value={Math.round(retryDelay / 1000)}
              onChange={(e) => update({ retryDelay: Math.max(1, Math.min(60, Number(e.target.value) || 2)) * 1000 })}
            />
          </div>
          <div>
            <label className={labelClass}>Retry On</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {RETRY_ERROR_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => toggleRetryOn(t.value)}
                  className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                    retryOn.includes(t.value)
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-white/10 bg-white/5 text-muted-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">Select which error types trigger a retry</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CRM Condition Editor ────────────────────────────────────

const CONDITION_FIELDS = [
  { value: "board_type", label: "Board Type" },
  { value: "stage", label: "Pipeline Stage" },
  { value: "value", label: "Deal Value" },
  { value: "assigned_to", label: "Assigned To" },
  { value: "company", label: "Company" },
  { value: "tags", label: "Tags" },
  { value: "lifecycle_stage", label: "Lifecycle Stage" },
  { value: "quality_score", label: "Quality Score" },
] as const;

const CONDITION_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not Contains" },
  { value: "starts_with", label: "Starts With" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" },
] as const;

/** Renders field/operator/value selectors for a single condition row */
function ConditionRow({
  field,
  operator,
  value,
  onFieldChange,
  onOperatorChange,
  onValueChange,
  onRemove,
}: {
  field: string;
  operator: string;
  value: string;
  onFieldChange: (v: string) => void;
  onOperatorChange: (v: string) => void;
  onValueChange: (v: string) => void;
  onRemove?: () => void;
}) {
  const needsValuePicker = operator !== "is_empty" && operator !== "is_not_empty";
  const showPicker = needsValuePicker && ["stage", "board_type", "assigned_to"].includes(field);
  const { options: stageOptions, loading: stagesLoading } = useCrmOptions("stages", undefined, field === "stage" && showPicker);
  const { options: teamOptions, loading: teamLoading } = useCrmOptions("team", undefined, field === "assigned_to" && showPicker);
  const { options: boardOptions } = useCrmOptions("boards", undefined, field === "board_type" && showPicker);

  return (
    <div className="space-y-2 relative">
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-1 -top-1 text-red-400 hover:text-red-300 text-xs font-bold"
          title="Remove condition"
        >
          ✕
        </button>
      )}
      <div>
        <label className={labelClass}>Field</label>
        <select className={selectClass} value={field} onChange={(e) => onFieldChange(e.target.value)}>
          {CONDITION_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Operator</label>
        <select className={selectClass} value={operator} onChange={(e) => onOperatorChange(e.target.value)}>
          {CONDITION_OPERATORS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {needsValuePicker && (
        showPicker ? (
          field === "stage" ? (
            <Combobox label="Value" options={stageOptions} loading={stagesLoading} value={value} onChange={onValueChange} placeholder="Select stage" />
          ) : field === "board_type" ? (
            <Combobox label="Value" options={boardOptions} loading={false} value={value} onChange={onValueChange} placeholder="Select board" />
          ) : field === "assigned_to" ? (
            <Combobox label="Value" options={teamOptions} loading={teamLoading} value={value} onChange={onValueChange} placeholder="Select team member" />
          ) : null
        ) : (
          <div>
            <label className={labelClass}>Value</label>
            <input className={inputClass} value={value} onChange={(e) => onValueChange(e.target.value)} placeholder="Compare value" />
          </div>
        )
      )}
    </div>
  );
}

const CrmConditionEditor: CustomNodeEditor = ({ data, onChange }) => {
  const d = data as Partial<CrmConditionNodeData>;
  const conditions = (d.conditions as CrmConditionRule[]) ?? [];
  const logic = (d.logic as "and" | "or") ?? "and";

  function addCondition() {
    onChange({ conditions: [...conditions, { field: "stage", operator: "equals", value: "" }] });
  }

  function updateCondition(index: number, updates: Partial<CrmConditionRule>) {
    const updated = conditions.map((c, i) => (i === index ? { ...c, ...updates } : c));
    onChange({ conditions: updated });
  }

  function removeCondition(index: number) {
    const updated = conditions.filter((_, i) => i !== index);
    onChange({ conditions: updated.length > 0 ? updated : undefined, logic: updated.length > 0 ? logic : undefined });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Label</label>
        <input
          className={inputClass}
          value={(d.label as string) || ""}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Node label"
        />
      </div>

      {/* Primary condition */}
      <div className="rounded-md border border-white/5 p-2 space-y-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Condition 1</div>
        <ConditionRow
          field={d.field || "stage"}
          operator={d.operator || "equals"}
          value={(d.value as string) || ""}
          onFieldChange={(v) => onChange({ field: v })}
          onOperatorChange={(v) => onChange({ operator: v })}
          onValueChange={(v) => onChange({ value: v })}
        />
      </div>

      {/* AND/OR toggle — shown when compound conditions exist */}
      {conditions.length > 0 && (
        <div className="flex items-center gap-2">
          <span className={labelClass}>Logic:</span>
          <button
            type="button"
            className={`px-2 py-0.5 text-[10px] rounded ${logic === "and" ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"}`}
            onClick={() => onChange({ logic: "and" })}
          >
            AND
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 text-[10px] rounded ${logic === "or" ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"}`}
            onClick={() => onChange({ logic: "or" })}
          >
            OR
          </button>
        </div>
      )}

      {/* Additional conditions */}
      {conditions.map((c, i) => (
        <div key={i} className="rounded-md border border-white/5 p-2 space-y-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Condition {i + 2}</div>
          <ConditionRow
            field={c.field}
            operator={c.operator}
            value={c.value}
            onFieldChange={(v) => updateCondition(i, { field: v })}
            onOperatorChange={(v) => updateCondition(i, { operator: v })}
            onValueChange={(v) => updateCondition(i, { value: v })}
            onRemove={() => removeCondition(i)}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addCondition}
        className="w-full rounded-md border border-dashed border-white/10 py-1.5 text-[11px] text-muted-foreground hover:border-white/20 hover:text-foreground transition-colors"
      >
        + Add Condition
      </button>
    </div>
  );
};

// ── Export registry ──────────────────────────────────────────

// ── Loop Editor ───────────────────────────────────────────

const CrmLoopEditor: CustomNodeEditor = ({ data, onChange }) => {
  const d = data as Partial<CrmLoopNodeData>;
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Label</label>
        <input className={inputClass} value={(d.label as string) || ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="Loop" />
      </div>
      <div>
        <label className={labelClass}>Source Variable</label>
        <input className={inputClass} value={(d.sourceVariable as string) || ""} onChange={(e) => onChange({ sourceVariable: e.target.value })} placeholder="e.g. stale_deals" />
        <p className="text-[10px] text-muted-foreground mt-1">Template variable containing a JSON array</p>
      </div>
      <div>
        <label className={labelClass}>Item Variable Name</label>
        <input className={inputClass} value={(d.itemVariable as string) || "item"} onChange={(e) => onChange({ itemVariable: e.target.value })} placeholder="item" />
        <p className="text-[10px] text-muted-foreground mt-1">Access current item as {"{{item}}"} in downstream nodes</p>
      </div>
      <div>
        <label className={labelClass}>Max Iterations</label>
        <input className={inputClass} type="number" min={1} max={1000} value={(d.maxIterations as number) || 100} onChange={(e) => onChange({ maxIterations: Number(e.target.value) })} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={d.continueOnError !== false} onChange={(e) => onChange({ continueOnError: e.target.checked })} className="rounded" />
        <label className="text-[11px] text-muted-foreground">Continue on error -- skip failed items and proceed</label>
      </div>
    </div>
  );
};

const CrmMergeEditor: CustomNodeEditor = ({ data, onChange }) => {
  const d = data as Partial<CrmMergeNodeData>;
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Label</label>
        <input className={inputClass} value={(d.label as string) || ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="Merge" />
      </div>
      <div>
        <label className={labelClass}>Mode</label>
        <select className={selectClass} value={(d.mode as string) || "all"} onChange={(e) => onChange({ mode: e.target.value })}>
          <option value="all">Wait for All -- all branches must arrive</option>
          <option value="any">Wait for Any -- continue on first arrival</option>
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">
          {(d.mode || "all") === "all"
            ? "Waits until every incoming branch has completed before continuing downstream."
            : "Continues as soon as the first branch arrives. Later arrivals are ignored."}
        </p>
      </div>
    </div>
  );
};

// ── Sub-Workflow Editor ───────────────────────────────────

interface WorkflowOption {
  value: string;
  label: string;
}

const CrmSubworkflowEditor: CustomNodeEditor = ({ data, onChange }) => {
  const d = data as Partial<CrmSubworkflowNodeData>;
  const [workflows, setWorkflows] = React.useState<WorkflowOption[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/loop/workflows")
      .then((r) => (r.ok ? r.json() : { workflows: [] }))
      .then((res) => {
        if (!cancelled) {
          setWorkflows(
            (res.workflows ?? []).map((w: { id: string; name: string }) => ({
              value: w.id,
              label: w.name,
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setWorkflows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selectedName = workflows.find((w) => w.value === d.workflowId)?.label;

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Label</label>
        <input
          className={inputClass}
          value={(d.label as string) || ""}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Sub-Workflow"
        />
      </div>
      <Combobox
        label="Workflow"
        options={workflows}
        loading={loading}
        value={(d.workflowId as string) || ""}
        onChange={(v) => {
          const name = workflows.find((w) => w.value === v)?.label;
          onChange({ workflowId: v, workflowName: name || "" });
        }}
        placeholder="Select workflow..."
      />
      {selectedName && (
        <div className="text-[10px] text-indigo-400/80 bg-indigo-500/10 rounded px-2 py-1">
          Will run: {selectedName}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="passVars"
          checked={d.passVars !== false}
          onChange={(e) => onChange({ passVars: e.target.checked })}
          className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50"
        />
        <label htmlFor="passVars" className="text-[11px] text-muted-foreground cursor-pointer">
          Pass current variables to sub-workflow
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="waitForCompletion"
          checked={d.waitForCompletion !== false}
          onChange={(e) => onChange({ waitForCompletion: e.target.checked })}
          className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50"
        />
        <label htmlFor="waitForCompletion" className="text-[11px] text-muted-foreground cursor-pointer">
          Wait for completion before continuing
        </label>
      </div>
      <div className="text-[10px] text-muted-foreground bg-white/5 rounded-md p-2">
        Sub-workflows can be nested up to 3 levels deep. Circular references are automatically detected and blocked.
      </div>
    </div>
  );
};

export const CRM_NODE_EDITORS: Record<string, CustomNodeEditor> = {
  crmTriggerNode: CrmTriggerEditor,
  crmActionNode: CrmActionEditor,
  crmConditionNode: CrmConditionEditor,
  crmLoopNode: CrmLoopEditor,
  crmMergeNode: CrmMergeEditor,
  crmSubworkflowNode: CrmSubworkflowEditor,
};
