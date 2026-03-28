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

// ── CRM Trigger Editor ──────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: "deal_stage_change", label: "Deal Stage Change" },
  { value: "deal_created", label: "Deal Created" },
  { value: "deal_won", label: "Deal Won" },
  { value: "deal_lost", label: "Deal Lost" },
  { value: "deal_stale", label: "Deal Stale" },
  { value: "deal_value_change", label: "Deal Value Change" },
  { value: "contact_created", label: "Contact Created" },
  { value: "tg_message", label: "TG Message" },
  { value: "tg_member_joined", label: "TG Member Joined" },
  { value: "tg_member_left", label: "TG Member Left" },
  { value: "email_received", label: "Email Received" },
  { value: "lead_qualified", label: "Lead Qualified" },
  { value: "scheduled", label: "Scheduled" },
] as const;

const CrmTriggerEditor: CustomNodeEditor = ({ data, onChange }) => {
  const d = data as Partial<CrmTriggerNodeData>;
  const config = (d.config ?? {}) as Record<string, string>;

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
        <div>
          <label className={labelClass}>Stage Filter (optional)</label>
          <input
            className={inputClass}
            value={config.stage_name || ""}
            onChange={(e) => onChange({ config: { ...config, stage_name: e.target.value } })}
            placeholder="e.g. MOU Signed"
          />
        </div>
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
        <div>
          <label className={labelClass}>Group Filter (optional)</label>
          <input
            className={inputClass}
            value={config.group_id || ""}
            onChange={(e) => onChange({ config: { ...config, group_id: e.target.value } })}
            placeholder="Telegram group ID"
          />
        </div>
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
          value={d.crmAction || "send_telegram"}
          onChange={(e) => onChange({ crmAction: e.target.value })}
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Action-specific config fields */}
      {(d.crmAction === "send_telegram" || d.crmAction === "send_broadcast") && (
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
          {d.crmAction === "send_telegram" && (
            <div>
              <label className={labelClass}>Chat ID (optional)</label>
              <input className={inputClass} value={config.chat_id || ""} onChange={(e) => updateConfig("chat_id", e.target.value)} placeholder="Override chat ID" />
            </div>
          )}
          {d.crmAction === "send_broadcast" && (
            <div>
              <label className={labelClass}>Slug Filter</label>
              <input className={inputClass} value={config.slug || ""} onChange={(e) => updateConfig("slug", e.target.value)} placeholder="e.g. partners" />
            </div>
          )}
        </>
      )}

      {d.crmAction === "send_email" && (
        <>
          <div>
            <label className={labelClass}>To</label>
            <input className={inputClass} value={config.to || ""} onChange={(e) => updateConfig("to", e.target.value)} placeholder="Recipient email" />
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

      {d.crmAction === "send_slack" && (
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

      {(d.crmAction === "update_deal" || d.crmAction === "update_contact") && (
        <>
          <div>
            <label className={labelClass}>Field</label>
            <input className={inputClass} value={config.field || ""} onChange={(e) => updateConfig("field", e.target.value)} placeholder="Field name" />
          </div>
          <div>
            <label className={labelClass}>Value</label>
            <input className={inputClass} value={config.value || ""} onChange={(e) => updateConfig("value", e.target.value)} placeholder="New value" />
          </div>
        </>
      )}

      {d.crmAction === "assign_deal" && (
        <div>
          <label className={labelClass}>Assign To (user ID)</label>
          <input className={inputClass} value={config.assign_to || ""} onChange={(e) => updateConfig("assign_to", e.target.value)} placeholder="User ID" />
        </div>
      )}

      {d.crmAction === "create_deal" && (
        <>
          <div>
            <label className={labelClass}>Deal Name</label>
            <input className={inputClass} value={config.name || ""} onChange={(e) => updateConfig("name", e.target.value)} placeholder="New deal name" />
          </div>
          <div>
            <label className={labelClass}>Board</label>
            <select className={selectClass} value={config.board_type || "BD"} onChange={(e) => updateConfig("board_type", e.target.value)}>
              <option value="BD">BD</option>
              <option value="Marketing">Marketing</option>
              <option value="Admin">Admin</option>
              <option value="Applications">Applications</option>
            </select>
          </div>
        </>
      )}

      {d.crmAction === "create_task" && (
        <>
          <div>
            <label className={labelClass}>Title</label>
            <input className={inputClass} value={config.title || ""} onChange={(e) => updateConfig("title", e.target.value)} placeholder="Task title" />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={`${inputClass} min-h-[40px] resize-y`} value={config.description || ""} onChange={(e) => updateConfig("description", e.target.value)} placeholder="Task description" />
          </div>
        </>
      )}

      {(d.crmAction === "add_tag" || d.crmAction === "remove_tag") && (
        <div>
          <label className={labelClass}>Tag</label>
          <input className={inputClass} value={config.tag || ""} onChange={(e) => updateConfig("tag", e.target.value)} placeholder="Tag name" />
        </div>
      )}

      {d.crmAction === "http_request" && (
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

      {d.crmAction === "ai_classify" && (
        <div>
          <label className={labelClass}>Categories</label>
          <input className={inputClass} value={config.categories || ""} onChange={(e) => updateConfig("categories", e.target.value)} placeholder="hot,warm,cold" />
        </div>
      )}

      {(d.crmAction === "add_to_sequence" || d.crmAction === "remove_from_sequence") && (
        <div>
          <label className={labelClass}>Sequence ID</label>
          <input className={inputClass} value={config.sequence_id || ""} onChange={(e) => updateConfig("sequence_id", e.target.value)} placeholder="Sequence ID" />
        </div>
      )}

      {d.crmAction === "tg_manage_access" && (
        <>
          <div>
            <label className={labelClass}>Slug</label>
            <input className={inputClass} value={config.slug || ""} onChange={(e) => updateConfig("slug", e.target.value)} placeholder="Access slug" />
          </div>
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
        <div>
          <label className={labelClass}>Value</label>
          <input
            className={inputClass}
            value={(d.value as string) || ""}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Compare value"
          />
        </div>
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
