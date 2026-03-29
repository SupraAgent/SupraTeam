"use client";

import React from "react";
import type { CustomNodeEditor } from "@supra/loop-builder";
import type { CrmTriggerNodeData } from "../_nodes/crm-trigger-node";
import type { CrmActionNodeData } from "../_nodes/crm-action-node";
import type { CrmConditionNodeData } from "../_nodes/crm-condition-node";

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
        <AsyncSelect
          label="Stage Filter (optional)"
          options={stageOptions}
          loading={stagesLoading}
          value={config.stage_name || ""}
          onChange={(v) => onChange({ config: { ...config, stage_name: v } })}
          placeholder="Any stage"
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
      {(d.crmTrigger === "tg_message" || d.crmTrigger === "tg_member_joined" || d.crmTrigger === "tg_member_left") && (
        <AsyncSelect
          label="Group Filter (optional)"
          options={groupOptions}
          loading={groupsLoading}
          value={config.group_id || ""}
          onChange={(v) => onChange({ config: { ...config, group_id: v } })}
          placeholder="Any group"
        />
      )}
    </div>
  );
};

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
] as const;

const CrmActionEditor: CustomNodeEditor = ({ data, onChange }) => {
  const d = data as Partial<CrmActionNodeData>;
  const config = (d.config ?? {}) as Record<string, string>;
  const crmAction = d.crmAction || "send_telegram";

  // Fetch options lazily — only when the selected action needs them
  const needsGroups = crmAction === "send_telegram";
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
            <textarea
              className={`${inputClass} min-h-[60px] resize-y`}
              value={config.message || ""}
              onChange={(e) => updateConfig("message", e.target.value)}
              placeholder="Message text (supports {{deal_name}}, {{company}} vars)"
            />
          </div>
          {crmAction === "send_telegram" && (
            <AsyncSelect
              label="Chat / Group (optional)"
              options={groupOptions}
              loading={groupsLoading}
              value={config.chat_id || ""}
              onChange={(v) => updateConfig("chat_id", v)}
              placeholder="Use deal's linked chat"
            />
          )}
          {crmAction === "send_broadcast" && (
            <AsyncSelect
              label="Slug Filter"
              options={slugOptions}
              loading={slugsLoading}
              value={config.slug || ""}
              onChange={(v) => updateConfig("slug", v)}
              placeholder="Select slug"
            />
          )}
        </>
      )}

      {crmAction === "send_email" && (
        <>
          <div>
            <label className={labelClass}>To</label>
            <input className={inputClass} value={config.to || ""} onChange={(e) => updateConfig("to", e.target.value)} placeholder="Recipient email or {{contact_email}}" />
          </div>
          <div>
            <label className={labelClass}>Subject</label>
            <input className={inputClass} value={config.subject || ""} onChange={(e) => updateConfig("subject", e.target.value)} placeholder="Email subject" />
          </div>
          <div>
            <label className={labelClass}>Body</label>
            <textarea className={`${inputClass} min-h-[60px] resize-y`} value={config.body || ""} onChange={(e) => updateConfig("body", e.target.value)} placeholder="Email body" />
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
            <textarea className={`${inputClass} min-h-[60px] resize-y`} value={config.message || ""} onChange={(e) => updateConfig("message", e.target.value)} placeholder="Slack message" />
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
            <AsyncSelect
              label="Stage"
              options={stageOptions}
              loading={stagesLoading}
              value={config.value || ""}
              onChange={(v) => updateConfig("value", v)}
              placeholder="Select stage"
            />
          ) : config.field === "board_type" ? (
            <AsyncSelect
              label="Board"
              options={boardOptions}
              loading={false}
              value={config.value || ""}
              onChange={(v) => updateConfig("value", v)}
              placeholder="Select board"
            />
          ) : config.field === "assigned_to" ? (
            <AsyncSelect
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
        <AsyncSelect
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
          <AsyncSelect
            label="Board"
            options={boardOptions}
            loading={false}
            value={config.board_type || "BD"}
            onChange={(v) => updateConfig("board_type", v)}
            placeholder="Select board"
          />
          <AsyncSelect
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
          <AsyncSelect
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
            <input className={inputClass} value={config.url || ""} onChange={(e) => updateConfig("url", e.target.value)} placeholder="https://api.example.com/webhook" />
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
            <textarea className={`${inputClass} min-h-[40px] resize-y font-mono`} value={config.body || ""} onChange={(e) => updateConfig("body", e.target.value)} placeholder='{"key": "value"}' />
          </div>
        </>
      )}

      {crmAction === "ai_classify" && (
        <div>
          <label className={labelClass}>Categories</label>
          <input className={inputClass} value={config.categories || ""} onChange={(e) => updateConfig("categories", e.target.value)} placeholder="hot,warm,cold" />
        </div>
      )}

      {(crmAction === "add_to_sequence" || crmAction === "remove_from_sequence") && (
        <AsyncSelect
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
          <AsyncSelect
            label="Slug"
            options={slugOptions}
            loading={slugsLoading}
            value={config.slug || ""}
            onChange={(v) => updateConfig("slug", v)}
            placeholder="Select slug"
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
    </div>
  );
};

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
  { value: "gt", label: "Greater Than" },
  { value: "lt", label: "Less Than" },
  { value: "is_empty", label: "Is Empty" },
] as const;

const CrmConditionEditor: CustomNodeEditor = ({ data, onChange }) => {
  const d = data as Partial<CrmConditionNodeData>;
  const field = d.field || "stage";
  const { options: stageOptions, loading: stagesLoading } = useCrmOptions("stages", undefined, field === "stage");
  const { options: teamOptions, loading: teamLoading } = useCrmOptions("team", undefined, field === "assigned_to");
  const { options: boardOptions } = useCrmOptions("boards", undefined, field === "board_type");

  // Show async picker for certain field+operator combos
  const showPicker = d.operator !== "is_empty" && ["stage", "board_type", "assigned_to"].includes(d.field || "");

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
        <label className={labelClass}>Field</label>
        <select
          className={selectClass}
          value={d.field || "stage"}
          onChange={(e) => onChange({ field: e.target.value })}
        >
          {CONDITION_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Operator</label>
        <select
          className={selectClass}
          value={d.operator || "equals"}
          onChange={(e) => onChange({ operator: e.target.value })}
        >
          {CONDITION_OPERATORS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {d.operator !== "is_empty" && (
        showPicker ? (
          d.field === "stage" ? (
            <AsyncSelect
              label="Value"
              options={stageOptions}
              loading={stagesLoading}
              value={(d.value as string) || ""}
              onChange={(v) => onChange({ value: v })}
              placeholder="Select stage"
            />
          ) : d.field === "board_type" ? (
            <AsyncSelect
              label="Value"
              options={boardOptions}
              loading={false}
              value={(d.value as string) || ""}
              onChange={(v) => onChange({ value: v })}
              placeholder="Select board"
            />
          ) : d.field === "assigned_to" ? (
            <AsyncSelect
              label="Value"
              options={teamOptions}
              loading={teamLoading}
              value={(d.value as string) || ""}
              onChange={(v) => onChange({ value: v })}
              placeholder="Select team member"
            />
          ) : null
        ) : (
          <div>
            <label className={labelClass}>Value</label>
            <input
              className={inputClass}
              value={(d.value as string) || ""}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder="Compare value"
            />
          </div>
        )
      )}
    </div>
  );
};

// ── Export registry ──────────────────────────────────────────

export const CRM_NODE_EDITORS: Record<string, CustomNodeEditor> = {
  crmTriggerNode: CrmTriggerEditor,
  crmActionNode: CrmActionEditor,
  crmConditionNode: CrmConditionEditor,
};
