"use client";

import * as React from "react";
import type { Node } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import type {
  ChatbotNodeData,
  MessageNodeData,
  QuestionNodeData,
  ConditionNodeData,
  ActionNodeData,
  AINodeData,
  EscalationNodeData,
  DelayNodeData,
  QuestionResponseType,
  ConditionType,
  ChatbotActionType,
  AIModelType,
} from "./types";

interface FlowConfigPanelProps {
  node: Node;
  onDataChange: (nodeId: string, newData: ChatbotNodeData) => void;
  onDelete: (nodeId: string) => void;
}

// ── Variable interpolation help ──────────────────────────────────

function VariableHelp() {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2.5 space-y-1">
      <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase">Variables</p>
      <p className="text-[9px] text-muted-foreground/50 font-mono">{"{user_name}"} - Telegram name</p>
      <p className="text-[9px] text-muted-foreground/50 font-mono">{"{user_id}"} - Telegram user ID</p>
      <p className="text-[9px] text-muted-foreground/50 font-mono">{"{collected.field}"} - Collected data</p>
    </div>
  );
}

// ── Per-node-type config fields ──────────────────────────────────

function MessageConfig({
  data,
  onChange,
}: {
  data: MessageNodeData;
  onChange: (d: MessageNodeData) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Label</label>
        <input
          type="text"
          value={data.label}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Message Text</label>
        <textarea
          value={data.config.messageText}
          onChange={(e) => onChange({ ...data, config: { ...data.config, messageText: e.target.value } })}
          rows={4}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40 resize-none"
          placeholder="Type the bot message..."
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Parse Mode</label>
        <select
          value={data.config.parseMode || "plain"}
          onChange={(e) => onChange({ ...data, config: { ...data.config, parseMode: e.target.value as "plain" | "markdown" } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        >
          <option value="plain">Plain text</option>
          <option value="markdown">Markdown</option>
        </select>
      </div>
      <VariableHelp />
    </div>
  );
}

function QuestionConfig({
  data,
  onChange,
}: {
  data: QuestionNodeData;
  onChange: (d: QuestionNodeData) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Label</label>
        <input
          type="text"
          value={data.label}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Question Text</label>
        <textarea
          value={data.config.questionText}
          onChange={(e) => onChange({ ...data, config: { ...data.config, questionText: e.target.value } })}
          rows={3}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40 resize-none"
          placeholder="What should the bot ask?"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Response Type</label>
        <select
          value={data.config.responseType}
          onChange={(e) => onChange({ ...data, config: { ...data.config, responseType: e.target.value as QuestionResponseType } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        >
          <option value="text">Text</option>
          <option value="choice">Choice</option>
          <option value="number">Number</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Variable Name</label>
        <input
          type="text"
          value={data.config.variableName}
          onChange={(e) => onChange({ ...data, config: { ...data.config, variableName: e.target.value } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:border-primary/40"
          placeholder="e.g. company, role, interest"
        />
      </div>
      {data.config.responseType === "choice" && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Choices (one per line)</label>
          <textarea
            value={(data.config.choices || []).join("\n")}
            onChange={(e) => onChange({ ...data, config: { ...data.config, choices: e.target.value.split("\n").filter(Boolean) } })}
            rows={3}
            className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40 resize-none"
            placeholder="Option A&#10;Option B&#10;Option C"
          />
        </div>
      )}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Validation Error Message</label>
        <input
          type="text"
          value={data.config.validationMessage || ""}
          onChange={(e) => onChange({ ...data, config: { ...data.config, validationMessage: e.target.value } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
          placeholder="Optional: shown when validation fails"
        />
      </div>
      <VariableHelp />
    </div>
  );
}

function ConditionConfig({
  data,
  onChange,
}: {
  data: ConditionNodeData;
  onChange: (d: ConditionNodeData) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Label</label>
        <input
          type="text"
          value={data.label}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Condition Type</label>
        <select
          value={data.config.conditionType}
          onChange={(e) => onChange({ ...data, config: { ...data.config, conditionType: e.target.value as ConditionType } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        >
          <option value="response_contains">Response contains</option>
          <option value="response_matches_regex">Response matches regex</option>
          <option value="collected_field_equals">Collected field equals</option>
          <option value="ai_intent_is">AI intent is</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Field / Variable</label>
        <input
          type="text"
          value={data.config.field}
          onChange={(e) => onChange({ ...data, config: { ...data.config, field: e.target.value } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:border-primary/40"
          placeholder="e.g. company, last_response"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Value</label>
        <input
          type="text"
          value={data.config.value}
          onChange={(e) => onChange({ ...data, config: { ...data.config, value: e.target.value } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
          placeholder="Value to compare against"
        />
      </div>
    </div>
  );
}

function ActionConfig({
  data,
  onChange,
}: {
  data: ActionNodeData;
  onChange: (d: ActionNodeData) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Label</label>
        <input
          type="text"
          value={data.label}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Action Type</label>
        <select
          value={data.config.actionType}
          onChange={(e) => onChange({ ...data, config: { ...data.config, actionType: e.target.value as ChatbotActionType } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        >
          <option value="create_contact">Create Contact</option>
          <option value="create_deal">Create Deal</option>
          <option value="assign_to">Assign to Rep</option>
          <option value="add_tag">Add Tag</option>
          <option value="send_notification">Send Notification</option>
          <option value="enroll_in_sequence">Enroll in Sequence</option>
        </select>
      </div>
      {data.config.actionType === "create_deal" && (
        <>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Deal Name Template</label>
            <input
              type="text"
              value={data.config.dealName || ""}
              onChange={(e) => onChange({ ...data, config: { ...data.config, dealName: e.target.value } })}
              className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
              placeholder="{collected.company} - Inbound"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Board Type</label>
            <select
              value={data.config.boardType || "BD"}
              onChange={(e) => onChange({ ...data, config: { ...data.config, boardType: e.target.value } })}
              className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
            >
              <option value="BD">BD</option>
              <option value="Marketing">Marketing</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
        </>
      )}
      {data.config.actionType === "assign_to" && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Assignee ID</label>
          <input
            type="text"
            value={data.config.assigneeId || ""}
            onChange={(e) => onChange({ ...data, config: { ...data.config, assigneeId: e.target.value } })}
            className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
            placeholder="User ID of assignee"
          />
        </div>
      )}
      {data.config.actionType === "add_tag" && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Tag Name</label>
          <input
            type="text"
            value={data.config.tagName || ""}
            onChange={(e) => onChange({ ...data, config: { ...data.config, tagName: e.target.value } })}
            className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
            placeholder="Tag name"
          />
        </div>
      )}
      {data.config.actionType === "send_notification" && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Notification Message</label>
          <textarea
            value={data.config.notificationMessage || ""}
            onChange={(e) => onChange({ ...data, config: { ...data.config, notificationMessage: e.target.value } })}
            rows={3}
            className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40 resize-none"
            placeholder="Notification message template"
          />
        </div>
      )}
      {data.config.actionType === "enroll_in_sequence" && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Sequence ID</label>
          <input
            type="text"
            value={data.config.sequenceId || ""}
            onChange={(e) => onChange({ ...data, config: { ...data.config, sequenceId: e.target.value } })}
            className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
            placeholder="Outreach sequence ID"
          />
        </div>
      )}
      <VariableHelp />
    </div>
  );
}

function AIConfig({
  data,
  onChange,
}: {
  data: AINodeData;
  onChange: (d: AINodeData) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Label</label>
        <input
          type="text"
          value={data.label}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Prompt Template</label>
        <textarea
          value={data.config.promptTemplate}
          onChange={(e) => onChange({ ...data, config: { ...data.config, promptTemplate: e.target.value } })}
          rows={5}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40 resize-none"
          placeholder="You are a helpful assistant. The user said: {collected.last_response}. Classify their intent."
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Model</label>
        <select
          value={data.config.model}
          onChange={(e) => onChange({ ...data, config: { ...data.config, model: e.target.value as AIModelType } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        >
          <option value="haiku">Claude Haiku (faster)</option>
          <option value="sonnet">Claude Sonnet (smarter)</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Response Variable Name</label>
        <input
          type="text"
          value={data.config.variableName}
          onChange={(e) => onChange({ ...data, config: { ...data.config, variableName: e.target.value } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:border-primary/40"
          placeholder="ai_response"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Max Tokens</label>
        <input
          type="number"
          value={data.config.maxTokens || 300}
          onChange={(e) => onChange({ ...data, config: { ...data.config, maxTokens: parseInt(e.target.value) || 300 } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        />
      </div>
      <VariableHelp />
    </div>
  );
}

function EscalationConfig({
  data,
  onChange,
}: {
  data: EscalationNodeData;
  onChange: (d: EscalationNodeData) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Label</label>
        <input
          type="text"
          value={data.label}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Escalation Reason</label>
        <input
          type="text"
          value={data.config.reason}
          onChange={(e) => onChange({ ...data, config: { ...data.config, reason: e.target.value } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
          placeholder="e.g. pricing question, technical issue"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Notify Roles (comma-separated)</label>
        <input
          type="text"
          value={data.config.notifyRoles.join(", ")}
          onChange={(e) => onChange({ ...data, config: { ...data.config, notifyRoles: e.target.value.split(",").map((r) => r.trim()).filter(Boolean) } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
          placeholder="bd_lead, admin_lead"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Handoff Message</label>
        <textarea
          value={data.config.handoffMessage}
          onChange={(e) => onChange({ ...data, config: { ...data.config, handoffMessage: e.target.value } })}
          rows={3}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40 resize-none"
          placeholder="A team member will be with you shortly..."
        />
      </div>
    </div>
  );
}

function DelayConfig({
  data,
  onChange,
}: {
  data: DelayNodeData;
  onChange: (d: DelayNodeData) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Label</label>
        <input
          type="text"
          value={data.label}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Duration</label>
        <input
          type="number"
          value={data.config.duration}
          onChange={(e) => onChange({ ...data, config: { ...data.config, duration: parseInt(e.target.value) || 1 } })}
          min={1}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground/80 mb-1 block">Unit</label>
        <select
          value={data.config.unit}
          onChange={(e) => onChange({ ...data, config: { ...data.config, unit: e.target.value as "seconds" | "minutes" | "hours" } })}
          className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
        >
          <option value="seconds">Seconds</option>
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
        </select>
      </div>
    </div>
  );
}

// ── Main config panel ────────────────────────────────────────────

export function FlowConfigPanel({ node, onDataChange, onDelete }: FlowConfigPanelProps) {
  const nodeData = node.data as unknown as ChatbotNodeData;

  const handleChange = React.useCallback(
    (newData: ChatbotNodeData) => {
      onDataChange(node.id, newData);
    },
    [node.id, onDataChange]
  );

  const NODE_TYPE_LABELS: Record<string, string> = {
    cb_message: "Message",
    cb_question: "Question",
    cb_condition: "Condition",
    cb_action: "Action",
    cb_ai: "AI Response",
    cb_escalation: "Escalation",
    cb_delay: "Delay",
  };

  return (
    <div className="w-72 shrink-0 border-l border-white/10 bg-white/[0.02] flex flex-col overflow-y-auto">
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">
            {NODE_TYPE_LABELS[nodeData.nodeType] || "Node"}
          </p>
          <p className="text-[10px] text-muted-foreground/60">Configure node</p>
        </div>
        <button
          onClick={() => onDelete(node.id)}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground/40 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3">
        {nodeData.nodeType === "cb_message" && (
          <MessageConfig data={nodeData} onChange={handleChange} />
        )}
        {nodeData.nodeType === "cb_question" && (
          <QuestionConfig data={nodeData} onChange={handleChange} />
        )}
        {nodeData.nodeType === "cb_condition" && (
          <ConditionConfig data={nodeData} onChange={handleChange} />
        )}
        {nodeData.nodeType === "cb_action" && (
          <ActionConfig data={nodeData} onChange={handleChange} />
        )}
        {nodeData.nodeType === "cb_ai" && (
          <AIConfig data={nodeData} onChange={handleChange} />
        )}
        {nodeData.nodeType === "cb_escalation" && (
          <EscalationConfig data={nodeData} onChange={handleChange} />
        )}
        {nodeData.nodeType === "cb_delay" && (
          <DelayConfig data={nodeData} onChange={handleChange} />
        )}
      </div>
    </div>
  );
}
