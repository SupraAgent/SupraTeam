"use client";

import * as React from "react";
import type { Node } from "@xyflow/react";
import { X, Trash2 } from "lucide-react";
import type {
  TGNodeData,
  TGMessageNodeData,
  TGConditionNodeData,
  TGWaitNodeData,
  TGTriggerNodeData,
  ConditionType,
  TriggerType,
} from "./types";
import {
  CONDITION_TYPE_LABELS,
  TRIGGER_TYPE_LABELS,
  TEMPLATE_VARIABLES,
} from "./types";

interface NodeConfigPanelProps {
  node: Node;
  onDataChange: (nodeId: string, data: TGNodeData) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  pipelineStages?: Array<{ id: string; name: string }>;
}

export function NodeConfigPanel({
  node,
  onDataChange,
  onDelete,
  onClose,
  pipelineStages = [],
}: NodeConfigPanelProps) {
  const data = node.data as unknown as TGNodeData;

  function update(partial: Partial<TGNodeData>) {
    onDataChange(node.id, { ...data, ...partial } as TGNodeData);
  }

  const accentMap: Record<string, string> = {
    trigger: "text-emerald-400",
    message: "text-blue-400",
    condition: "text-yellow-400",
    wait: "text-gray-400",
  };

  return (
    <div className="w-80 shrink-0 border-l border-white/10 bg-white/[0.02] overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <p className={`text-xs font-semibold uppercase tracking-wider ${accentMap[data.nodeType] ?? "text-foreground"}`}>
          {data.nodeType} Config
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Label */}
        <Field label="Label">
          <input
            value={data.label}
            onChange={(e) => update({ label: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
            placeholder="Node label"
          />
        </Field>

        {data.nodeType === "trigger" && (
          <TriggerConfig data={data} update={(p) => update(p as Partial<TGNodeData>)} />
        )}
        {data.nodeType === "message" && (
          <MessageConfig data={data} update={(p) => update(p as Partial<TGNodeData>)} />
        )}
        {data.nodeType === "condition" && (
          <ConditionConfig
            data={data}
            update={(p) => update(p as Partial<TGNodeData>)}
            pipelineStages={pipelineStages}
          />
        )}
        {data.nodeType === "wait" && (
          <WaitConfig data={data} update={(p) => update(p as Partial<TGNodeData>)} />
        )}
      </div>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={() => onDelete(node.id)}
          className="flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full justify-start text-xs px-3 py-1.5 rounded-lg transition-colors"
        >
          <Trash2 className="h-3 w-3" />
          Delete Node
        </button>
      </div>
    </div>
  );
}

// ── Trigger Config ──────────────────────────────────────────────

function TriggerConfig({
  data,
  update,
}: {
  data: TGTriggerNodeData;
  update: (p: Partial<TGTriggerNodeData>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
        <p className="text-[10px] text-emerald-400/80">Sequence entry point</p>
      </div>

      <Field label="Trigger Type">
        <select
          value={data.trigger_type}
          onChange={(e) => update({ trigger_type: e.target.value as TriggerType, trigger_config: {} })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
        >
          {(Object.entries(TRIGGER_TYPE_LABELS) as Array<[TriggerType, string]>).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </Field>

      {data.trigger_type === "keyword_match" && (
        <Field label="Keyword">
          <input
            value={data.trigger_config.keyword ?? ""}
            onChange={(e) => update({ trigger_config: { ...data.trigger_config, keyword: e.target.value } })}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
            placeholder="Match keyword..."
          />
        </Field>
      )}
    </div>
  );
}

// ── Message Config ──────────────────────────────────────────────

function MessageConfig({
  data,
  update,
}: {
  data: TGMessageNodeData;
  update: (p: Partial<TGMessageNodeData>) => void;
}) {
  const [showVariantB, setShowVariantB] = React.useState(!!data.variant_b_template);
  const [showVariantC, setShowVariantC] = React.useState(!!data.variant_c_template);

  function insertVariable(key: string) {
    update({ template: (data.template || "") + key });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 px-3 py-2">
        <p className="text-[10px] text-blue-400/80">Telegram message step</p>
      </div>

      <Field label="Delay (hours)">
        <input
          type="number"
          min={0}
          value={data.delay_hours}
          onChange={(e) => update({ delay_hours: Number(e.target.value) })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
        />
      </Field>

      <Field label="Template (Variant A)">
        <textarea
          value={data.template}
          onChange={(e) => update({ template: e.target.value })}
          placeholder="Enter message template..."
          rows={4}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs font-mono resize-none outline-none focus:border-white/20"
        />
      </Field>

      <div className="flex flex-wrap gap-1">
        {TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => insertVariable(v.key)}
            className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
          >
            {v.key}
          </button>
        ))}
      </div>

      {/* Variant B */}
      {!showVariantB ? (
        <button
          type="button"
          onClick={() => {
            setShowVariantB(true);
            update({ variant_b_template: data.template || "" });
          }}
          className="text-[10px] text-purple-400 hover:underline"
        >
          + Add Variant B (A/B test)
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-purple-400 uppercase tracking-wider">Variant B</span>
            <button
              type="button"
              onClick={() => {
                setShowVariantB(false);
                setShowVariantC(false);
                update({ variant_b_template: null, variant_c_template: null });
              }}
              className="text-[9px] text-red-400 hover:underline"
            >
              Remove
            </button>
          </div>
          <textarea
            value={data.variant_b_template ?? ""}
            onChange={(e) => update({ variant_b_template: e.target.value })}
            placeholder="Variant B message..."
            rows={3}
            className="w-full rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-xs font-mono resize-none outline-none focus:border-purple-500/30"
          />

          <Field label="B Delay Override (hours)">
            <input
              type="number"
              min={0}
              value={data.variant_b_delay_hours ?? ""}
              onChange={(e) => update({ variant_b_delay_hours: e.target.value ? Number(e.target.value) : null })}
              placeholder="Same as A"
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
            />
          </Field>

          <Field label="A/B Split (% to A)">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={99}
                value={data.ab_split_pct}
                onChange={(e) => update({ ab_split_pct: Number(e.target.value) })}
                className="flex-1 h-1 accent-purple-400"
              />
              <span className="text-[10px] text-muted-foreground w-14 text-right">
                {data.ab_split_pct}% A
              </span>
            </div>
          </Field>

          {/* Variant C */}
          {!showVariantC ? (
            <button
              type="button"
              onClick={() => {
                setShowVariantC(true);
                update({ variant_c_template: data.template || "" });
              }}
              className="text-[10px] text-cyan-400 hover:underline"
            >
              + Add Variant C
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-cyan-400 uppercase tracking-wider">Variant C</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowVariantC(false);
                    update({ variant_c_template: null });
                  }}
                  className="text-[9px] text-red-400 hover:underline"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={data.variant_c_template ?? ""}
                onChange={(e) => update({ variant_c_template: e.target.value })}
                placeholder="Variant C message..."
                rows={3}
                className="w-full rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-mono resize-none outline-none focus:border-cyan-500/30"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Condition Config ────────────────────────────────────────────

function ConditionConfig({
  data,
  update,
  pipelineStages,
}: {
  data: TGConditionNodeData;
  update: (p: Partial<TGConditionNodeData>) => void;
  pipelineStages: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 px-3 py-2">
        <p className="text-[10px] text-yellow-400/80">If / Else Branch</p>
      </div>

      <Field label="Condition Type">
        <select
          value={data.condition_type}
          onChange={(e) =>
            update({
              condition_type: e.target.value as ConditionType,
              threshold: null,
              keyword: null,
              stage_id: null,
              timeout_hours: null,
              days: null,
              split_percentage: e.target.value === "ab_split" ? 50 : null,
            })
          }
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
        >
          {(Object.entries(CONDITION_TYPE_LABELS) as Array<[ConditionType, string]>).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </Field>

      {data.condition_type === "engagement_score" && (
        <Field label="Threshold">
          <input
            type="number"
            min={0}
            max={100}
            value={data.threshold ?? 50}
            onChange={(e) => update({ threshold: Number(e.target.value) })}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
            placeholder="50"
          />
        </Field>
      )}

      {data.condition_type === "no_reply_timeout" && (
        <Field label="Timeout (hours)">
          <input
            type="number"
            min={1}
            value={data.timeout_hours ?? 24}
            onChange={(e) => update({ timeout_hours: Number(e.target.value) })}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
            placeholder="24"
          />
        </Field>
      )}

      {data.condition_type === "message_keyword" && (
        <Field label="Keyword">
          <input
            type="text"
            value={data.keyword ?? ""}
            onChange={(e) => update({ keyword: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
            placeholder="Enter keyword..."
          />
        </Field>
      )}

      {data.condition_type === "deal_stage" && (
        <Field label="Target Stage">
          <select
            value={data.stage_id ?? ""}
            onChange={(e) => update({ stage_id: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
          >
            <option value="">Select stage...</option>
            {pipelineStages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
      )}

      {data.condition_type === "days_since_enroll" && (
        <Field label="Days">
          <input
            type="number"
            min={1}
            value={data.days ?? 7}
            onChange={(e) => update({ days: Number(e.target.value) })}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
            placeholder="7"
          />
        </Field>
      )}

      {data.condition_type === "ab_split" && (
        <Field label="Split (% to A)">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={99}
              value={data.split_percentage ?? 50}
              onChange={(e) => update({ split_percentage: Number(e.target.value) })}
              className="flex-1 h-1 accent-yellow-400"
            />
            <span className="text-[10px] text-muted-foreground w-14 text-right">
              {data.split_percentage ?? 50}% A
            </span>
          </div>
        </Field>
      )}

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

// ── Wait Config ─────────────────────────────────────────────────

function WaitConfig({
  data,
  update,
}: {
  data: TGWaitNodeData;
  update: (p: Partial<TGWaitNodeData>) => void;
}) {
  const presets = [1, 6, 12, 24, 48, 72];

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
        <p className="text-[10px] text-muted-foreground">Wait before continuing to next step</p>
      </div>

      <Field label="Hours">
        <input
          type="number"
          min={1}
          value={data.wait_hours}
          onChange={(e) => update({ wait_hours: Number(e.target.value) })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
        />
      </Field>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => update({ wait_hours: h })}
            className={`rounded px-2 py-1 text-[10px] border transition-colors ${
              data.wait_hours === h
                ? "border-white/20 bg-white/10 text-foreground"
                : "border-white/5 bg-white/[0.02] text-muted-foreground hover:bg-white/5"
            }`}
          >
            {h}h
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Shared field wrapper ────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
