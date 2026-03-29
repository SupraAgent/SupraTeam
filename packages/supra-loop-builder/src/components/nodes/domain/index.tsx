// ── Domain-Specific Nodes ────────────────────────────────────────
//
// These nodes are specific to SupraLoop's competitive benchmarking workflow.
// When forking the builder for a different app, you can:
//   1. Remove this directory entirely
//   2. Pass your own domain nodes via the `customNodeTypes` prop
//   3. Or create your own domain/ barrel with your domain nodes
//
// The generic builder works perfectly without these — they are opt-in.

export { PersonaNode } from "../persona-node";
export { AppNode } from "../app-node";
export { CompetitorNode } from "../competitor-node";
export { ConsensusNode } from "../consensus-node";
export { AffinityCategoryNode } from "../affinity-category-node";
export { CpoReviewNode } from "../cpo-review-node";
export { RescoreNode } from "../rescore-node";

// Re-export types
export type {
  PersonaNodeData,
  AppNodeData,
  CompetitorNodeData,
  ConsensusNodeData,
  AffinityCategoryNodeData,
  CpoReviewNodeData,
  RescoreNodeData,
} from "../../../lib/flow-templates";

import type React from "react";
import { PersonaNode } from "../persona-node";
import { AppNode } from "../app-node";
import { CompetitorNode } from "../competitor-node";
import { ConsensusNode } from "../consensus-node";
import { AffinityCategoryNode } from "../affinity-category-node";
import { CpoReviewNode } from "../cpo-review-node";
import { RescoreNode } from "../rescore-node";

/**
 * Node type map for domain-specific nodes.
 * Pass this to `customNodeTypes` on `<WorkflowBuilder>` to enable them.
 *
 * @example
 * ```tsx
 * import { WorkflowBuilder } from "your-builder-package";
 * import { domainNodeTypes, DOMAIN_PALETTE_ITEMS } from "your-builder-package/domain";
 *
 * <WorkflowBuilder
 *   customNodeTypes={domainNodeTypes}
 *   customPaletteItems={DOMAIN_PALETTE_ITEMS}
 * />
 * ```
 */
export const domainNodeTypes: Record<string, React.ComponentType<unknown>> = {
  personaNode: PersonaNode as React.ComponentType<unknown>,
  appNode: AppNode as React.ComponentType<unknown>,
  competitorNode: CompetitorNode as React.ComponentType<unknown>,
  consensusNode: ConsensusNode as React.ComponentType<unknown>,
  affinityCategoryNode: AffinityCategoryNode as React.ComponentType<unknown>,
  cpoReviewNode: CpoReviewNode as React.ComponentType<unknown>,
  rescoreNode: RescoreNode as React.ComponentType<unknown>,
};

/**
 * Palette items for domain-specific nodes.
 * Pass these to `customPaletteItems` on `<WorkflowBuilder>` to show them
 * in the node palette sidebar.
 */
// Re-export domain templates so the host app can register them via setBuiltInTemplates()
export { DOMAIN_BUILT_IN_TEMPLATES } from "../../../lib/flow-templates";

/**
 * Palette items for domain-specific nodes.
 * Pass these to `customPaletteItems` on `<WorkflowBuilder>` to show them
 * in the node palette sidebar.
 */
export const DOMAIN_PALETTE_ITEMS = [
  {
    type: "personaNode",
    label: "Persona",
    emoji: "\u{1F464}",
    description: "AI team member",
    help: "Create an AI persona with role, expertise, and weighted voting power",
    group: "domain" as const,
    data: {
      label: "New Persona",
      role: "Team Member",
      voteWeight: 1.0,
      expertise: [],
      personality: "",
      emoji: "\u{1F464}",
    },
  },
  {
    type: "appNode",
    label: "App",
    emoji: "\u{1F680}",
    description: "Your application",
    help: "Define the app you're building \u2014 name, stack, users, and current state",
    group: "domain" as const,
    data: {
      label: "My App",
      description: "",
      targetUsers: "",
      coreValue: "",
      currentState: "",
    },
  },
  {
    type: "competitorNode",
    label: "Competitor",
    emoji: "\u{1F3E2}",
    description: "Reference app",
    help: "Add a competitor app to benchmark against with scoring",
    group: "domain" as const,
    data: {
      label: "Competitor",
      why: "",
      overallScore: 0,
      cpoName: "",
    },
  },
  {
    type: "consensusNode",
    label: "Consensus",
    emoji: "\u{1F5F3}\uFE0F",
    description: "Persona group bucket",
    help: "Aggregate persona votes into a consensus score",
    group: "domain" as const,
    data: {
      label: "Consensus",
      personas: [],
      consensusScore: 0,
    },
  },
  {
    type: "affinityCategoryNode",
    label: "Category",
    emoji: "\u{1F4D0}",
    description: "Scoring category",
    help: "Weighted scoring dimension with domain expert",
    group: "domain" as const,
    data: {
      label: "Category",
      weight: 0.1,
      score: 0,
      domainExpert: "",
    },
  },
  {
    type: "cpoReviewNode",
    label: "CPO Review",
    emoji: "\u{1F454}",
    description: "Multi-persona product review",
    help: "Run text through multiple CPO personas in parallel, returning individual scores and a consensus rating",
    group: "domain" as const,
    data: {
      label: "CPO Review",
      description: "Competitor CPOs review your improvements",
      personas: [],
      reviewMode: "consensus",
      systemPromptPrefix: "",
    },
  },
  {
    type: "rescoreNode",
    label: "Re-Score",
    emoji: "\u{1F4CA}",
    description: "Before/after comparison",
    help: "Re-run scoring after improvements and show delta",
    group: "domain" as const,
    data: {
      label: "Re-Score",
      categories: [],
      showDelta: true,
    },
  },
];

// ── Domain Inspector Editors ─────────────────────────────────────
// Pass `domainInspectorEditors` to `customInspectorEditors` on
// `<WorkflowBuilder>` to enable property editing for domain nodes.

import { Field, inputClass, textareaClass } from "../../node-inspector";
import { Combobox, type ComboboxOption } from "../../combobox";
import { ALL_COMPANY_OPTIONS } from "../../company-options";
import type {
  PersonaNodeData,
  AppNodeData,
  CompetitorNodeData,
  AffinityCategoryNodeData,
} from "../../../lib/flow-templates";

const PERSONA_ROLE_OPTIONS: ComboboxOption[] = [
  { value: "Head of Product", label: "Head of Product" },
  { value: "Engineering Lead", label: "Engineering Lead" },
  { value: "Design Lead", label: "Design Lead" },
  { value: "Growth & Analytics", label: "Growth & Analytics" },
  { value: "QA & Reliability", label: "QA & Reliability" },
  { value: "Competitor CPO", label: "Competitor CPO" },
];

const PERSONA_EMOJI_OPTIONS: ComboboxOption[] = [
  { value: "\u{1F3AF}", label: "\u{1F3AF} Target (Product)" },
  { value: "\u2699\uFE0F", label: "\u2699\uFE0F Gear (Engineering)" },
  { value: "\u{1F3A8}", label: "\u{1F3A8} Palette (Design)" },
  { value: "\u{1F4C8}", label: "\u{1F4C8} Chart (Growth)" },
  { value: "\u{1F6E1}\uFE0F", label: "\u{1F6E1}\uFE0F Shield (QA)" },
  { value: "\u{1F464}", label: "\u{1F464} Person" },
];

const PERSONALITY_SUGGESTIONS: ComboboxOption[] = [
  { value: "Data-driven, user-obsessed, kills scope creep", label: "Data-driven product thinker" },
  { value: "Pragmatic, hates over-engineering, ships fast", label: "Pragmatic engineer" },
  { value: "Opinionated on craft, pushes for polish", label: "Design perfectionist" },
  { value: "Metric-obsessed, challenges assumptions", label: "Growth-minded analyst" },
  { value: "Finds every bug, thinks in failure modes", label: "QA devil's advocate" },
];

const APP_STATE_OPTIONS: ComboboxOption[] = [
  { value: "", label: "Not set" },
  { value: "MVP", label: "MVP" },
  { value: "Beta", label: "Beta" },
  { value: "Production", label: "Production" },
];

const TARGET_USERS_SUGGESTIONS: ComboboxOption[] = [
  { value: "Developers", label: "Developers" },
  { value: "Product managers", label: "Product managers" },
  { value: "Designers", label: "Designers" },
  { value: "Startups", label: "Startups" },
  { value: "Enterprise teams", label: "Enterprise teams" },
];

const CORE_VALUE_SUGGESTIONS: ComboboxOption[] = [
  { value: "Save time on repetitive tasks", label: "Save time on repetitive tasks" },
  { value: "Improve team collaboration", label: "Improve team collaboration" },
  { value: "Automate workflows", label: "Automate workflows" },
  { value: "Better data-driven decisions", label: "Better data-driven decisions" },
];

const COMPETITOR_WHY_SUGGESTIONS: ComboboxOption[] = [
  { value: "Market leader in our category", label: "Market leader in our category" },
  { value: "Closest feature parity", label: "Closest feature parity" },
  { value: "Same target audience", label: "Same target audience" },
  { value: "Best-in-class UX to benchmark against", label: "Best-in-class UX" },
];

const DOMAIN_EXPERT_SUGGESTIONS: ComboboxOption[] = [
  { value: "Product Manager", label: "Product Manager" },
  { value: "Engineering Lead", label: "Engineering Lead" },
  { value: "Designer", label: "Designer" },
  { value: "Domain Specialist", label: "Domain Specialist" },
];

function PersonaEditorDomain({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const d = data as unknown as PersonaNodeData;
  return (
    <>
      <Field label="Name"><input className={inputClass} value={d.label} onChange={(e) => onChange({ label: e.target.value })} /></Field>
      <Field label="Role"><Combobox options={PERSONA_ROLE_OPTIONS} value={d.role} onChange={(v) => onChange({ role: v })} /></Field>
      <Field label="Emoji"><Combobox options={PERSONA_EMOJI_OPTIONS} value={d.emoji} onChange={(v) => onChange({ emoji: v })} allowCustom /></Field>
      <Field label="Vote Weight"><input type="number" step={0.1} min={0} max={3} className={inputClass} value={d.voteWeight} onChange={(e) => onChange({ voteWeight: parseFloat(e.target.value) || 0 })} /></Field>
      <Field label="Expertise (comma-separated)"><input className={inputClass} value={d.expertise?.join(", ") ?? ""} onChange={(e) => onChange({ expertise: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></Field>
      <Field label="Personality"><Combobox options={PERSONALITY_SUGGESTIONS} value={d.personality} onChange={(v) => onChange({ personality: v })} allowCustom placeholder="Type or pick a personality\u2026" /></Field>
    </>
  );
}

function AppEditorDomain({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const d = data as unknown as AppNodeData;
  return (
    <>
      <Field label="App Name"><Combobox options={ALL_COMPANY_OPTIONS} value={d.label} onChange={(v) => onChange({ label: v })} allowCustom placeholder="Type or search companies\u2026" /></Field>
      <Field label="Description"><textarea className={textareaClass} rows={2} value={d.description} onChange={(e) => onChange({ description: e.target.value })} /></Field>
      <Field label="Target Users"><Combobox options={TARGET_USERS_SUGGESTIONS} value={d.targetUsers} onChange={(v) => onChange({ targetUsers: v })} allowCustom /></Field>
      <Field label="Core Value"><Combobox options={CORE_VALUE_SUGGESTIONS} value={d.coreValue} onChange={(v) => onChange({ coreValue: v })} allowCustom /></Field>
      <Field label="Current State"><Combobox options={APP_STATE_OPTIONS} value={d.currentState} onChange={(v) => onChange({ currentState: v })} /></Field>
    </>
  );
}

function CompetitorEditorDomain({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const d = data as unknown as CompetitorNodeData;
  return (
    <>
      <Field label="Competitor Name"><Combobox options={ALL_COMPANY_OPTIONS} value={d.label} onChange={(v) => onChange({ label: v })} allowCustom /></Field>
      <Field label="Why this competitor?"><Combobox options={COMPETITOR_WHY_SUGGESTIONS} value={d.why} onChange={(v) => onChange({ why: v })} allowCustom /></Field>
      <Field label="Overall Score"><input type="number" min={0} max={100} className={inputClass} value={d.overallScore} onChange={(e) => onChange({ overallScore: parseInt(e.target.value) || 0 })} /></Field>
      <Field label="CPO Name"><input className={inputClass} value={d.cpoName} placeholder="Auto-generated or custom" onChange={(e) => onChange({ cpoName: e.target.value })} /></Field>
    </>
  );
}

function AffinityCategoryEditorDomain({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const d = data as unknown as AffinityCategoryNodeData;
  return (
    <>
      <Field label="Category Name"><input className={inputClass} value={d.label} onChange={(e) => onChange({ label: e.target.value })} /></Field>
      <Field label="Weight"><input type="number" step={0.1} min={0} className={inputClass} value={d.weight} onChange={(e) => onChange({ weight: parseFloat(e.target.value) || 0 })} /></Field>
      <Field label="Score"><input type="number" min={0} max={100} className={inputClass} value={d.score} onChange={(e) => onChange({ score: parseInt(e.target.value) || 0 })} /></Field>
      <Field label="Domain Expert"><Combobox options={DOMAIN_EXPERT_SUGGESTIONS} value={d.domainExpert} onChange={(v) => onChange({ domainExpert: v })} allowCustom placeholder="Type or pick an expert\u2026" /></Field>
    </>
  );
}

/**
 * Domain-specific inspector editors map.
 * Pass this to `customInspectorEditors` on `<WorkflowBuilder>` to enable
 * property editing for domain-specific node types.
 */
export const domainInspectorEditors: Record<
  string,
  React.ComponentType<{ data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }>
> = {
  personaNode: PersonaEditorDomain,
  appNode: AppEditorDomain,
  competitorNode: CompetitorEditorDomain,
  affinityCategoryNode: AffinityCategoryEditorDomain,
};
