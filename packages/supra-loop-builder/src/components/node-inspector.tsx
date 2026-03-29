"use client";

import * as React from "react";
import type { Node } from "@xyflow/react";
import { cn } from "../lib/utils";
import { useFocusTrap } from "../hooks/use-focus-trap";
import { useIsMobile } from "../hooks/use-mobile";
import { useSwipeToDismiss } from "../hooks/use-touch-device";
import { ExpressionEditor } from "./expression-editor";
import { listCredentials } from "../lib/credential-store";
import type {
  PersonaNodeData,
  AppNodeData,
  CompetitorNodeData,
  ActionNodeData,
  NoteNodeData,
  TriggerNodeData,
  ConditionNodeData,
  TransformNodeData,
  OutputNodeData,
  LLMNodeData,
  ConfigNodeData,
  ConfigNodeSection,
  StepNodeData,
  AffinityCategoryNodeData,
  HttpRequestNodeData,
} from "../lib/flow-templates";
import { getUserNodeById, type UserNodeDefinition, type UserNodeField } from "../lib/user-nodes";
import { Combobox, type ComboboxOption } from "./combobox";
import { ALL_COMPANY_OPTIONS } from "./company-options";

type NodeInspectorProps = {
  node: Node;
  nodes?: Node[];
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  /** Custom node type display info (injected by host app) */
  customNodeTypeInfo?: Record<string, { emoji: string; label: string; color: string }>;
  /** Custom editor components keyed by node type (injected by host app) */
  customNodeEditors?: Record<string, React.ComponentType<{ data: Record<string, unknown>; onChange: (partial: Record<string, unknown>) => void }>>;
};

// ── Shared field components ────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

const selectClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

const textareaClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none";

// ── Combobox option constants ──────────────────────────────────

const PERSONA_ROLE_OPTIONS: ComboboxOption[] = [
  { value: "Head of Product", label: "Head of Product" },
  { value: "Engineering Lead", label: "Engineering Lead" },
  { value: "Design Lead", label: "Design Lead" },
  { value: "Growth & Analytics", label: "Growth & Analytics" },
  { value: "QA & Reliability", label: "QA & Reliability" },
  { value: "Competitor CPO", label: "Competitor CPO" },
];

const APP_STATE_OPTIONS: ComboboxOption[] = [
  { value: "", label: "Not set" },
  { value: "MVP", label: "MVP" },
  { value: "Beta", label: "Beta" },
  { value: "Production", label: "Production" },
];

const ACTION_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "score", label: "Score" },
  { value: "analyze", label: "Analyze" },
  { value: "improve", label: "Improve" },
  { value: "generate", label: "Generate" },
  { value: "commit", label: "Commit" },
];

const TRIGGER_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "manual", label: "Manual" },
  { value: "schedule", label: "Schedule" },
  { value: "webhook", label: "Webhook" },
  { value: "event", label: "Event" },
];

const TRANSFORM_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "map", label: "Map" },
  { value: "filter", label: "Filter" },
  { value: "merge", label: "Merge" },
  { value: "extract", label: "Extract" },
  { value: "custom", label: "Custom" },
];

const OUTPUT_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "log", label: "Log" },
  { value: "api", label: "API" },
  { value: "file", label: "File" },
  { value: "notify", label: "Notify" },
  { value: "github", label: "GitHub" },
];

const LLM_PROVIDER_OPTIONS: ComboboxOption[] = [
  { value: "claude", label: "Claude" },
  { value: "claude-code", label: "Claude Code (Agent)" },
  { value: "ollama", label: "Ollama" },
  { value: "custom", label: "Custom" },
];

const CONFIG_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "root", label: "Root / Directory" },
  { value: "instructions", label: "Instructions" },
  { value: "settings", label: "Settings" },
  { value: "command", label: "Command" },
  { value: "rule", label: "Rule" },
  { value: "skill", label: "Skill" },
  { value: "agent", label: "Agent" },
];

const PERSONA_EMOJI_OPTIONS: ComboboxOption[] = [
  { value: "🎯", label: "🎯 Target (Product)" },
  { value: "⚙️", label: "⚙️ Gear (Engineering)" },
  { value: "🎨", label: "🎨 Palette (Design)" },
  { value: "📈", label: "📈 Chart (Growth)" },
  { value: "🛡️", label: "🛡️ Shield (QA)" },
  { value: "👤", label: "👤 Person" },
  { value: "🧠", label: "🧠 Brain (Strategy)" },
  { value: "🔬", label: "🔬 Microscope (Research)" },
  { value: "🚀", label: "🚀 Rocket (Launch)" },
  { value: "💡", label: "💡 Lightbulb (Ideas)" },
  { value: "🏢", label: "🏢 Building (Enterprise)" },
  { value: "🤖", label: "🤖 Robot (Automation)" },
  { value: "📊", label: "📊 Data" },
  { value: "🔒", label: "🔒 Lock (Security)" },
  { value: "🎪", label: "🎪 Circus (Creative)" },
];

const PERSONALITY_SUGGESTIONS: ComboboxOption[] = [
  { value: "Data-driven, user-obsessed, kills scope creep", label: "Data-driven product thinker" },
  { value: "Pragmatic, hates over-engineering, ships fast", label: "Pragmatic engineer" },
  { value: "Opinionated on craft, pushes for polish", label: "Design perfectionist" },
  { value: "Metric-obsessed, challenges assumptions", label: "Growth-minded analyst" },
  { value: "Finds every bug, thinks in failure modes", label: "QA devil's advocate" },
  { value: "Strategic thinker, balances speed with quality", label: "Strategic leader" },
  { value: "Customer empathy first, always asks 'why'", label: "Customer advocate" },
  { value: "Systematic, documentation-driven, process-oriented", label: "Process-oriented" },
  { value: "Creative problem solver, loves unconventional approaches", label: "Creative maverick" },
  { value: "Risk-aware, compliance-focused, security-first", label: "Security-first mindset" },
];

const TARGET_USERS_SUGGESTIONS: ComboboxOption[] = [
  { value: "Developers", label: "Developers" },
  { value: "Product managers", label: "Product managers" },
  { value: "Designers", label: "Designers" },
  { value: "Startups", label: "Startups" },
  { value: "Enterprise teams", label: "Enterprise teams" },
  { value: "Small businesses", label: "Small businesses" },
  { value: "Freelancers", label: "Freelancers" },
  { value: "Marketing teams", label: "Marketing teams" },
  { value: "Data scientists", label: "Data scientists" },
  { value: "DevOps engineers", label: "DevOps engineers" },
  { value: "Non-technical users", label: "Non-technical users" },
  { value: "Students", label: "Students" },
];

const CORE_VALUE_SUGGESTIONS: ComboboxOption[] = [
  { value: "Save time on repetitive tasks", label: "Save time on repetitive tasks" },
  { value: "Improve team collaboration", label: "Improve team collaboration" },
  { value: "Automate workflows", label: "Automate workflows" },
  { value: "Better data-driven decisions", label: "Better data-driven decisions" },
  { value: "Reduce operational costs", label: "Reduce operational costs" },
  { value: "Ship faster with fewer bugs", label: "Ship faster with fewer bugs" },
  { value: "Simplify complex processes", label: "Simplify complex processes" },
  { value: "Democratize access to AI", label: "Democratize access to AI" },
  { value: "Centralize scattered tools", label: "Centralize scattered tools" },
  { value: "Improve customer experience", label: "Improve customer experience" },
];

const COMPETITOR_WHY_SUGGESTIONS: ComboboxOption[] = [
  { value: "Market leader in our category", label: "Market leader in our category" },
  { value: "Closest feature parity", label: "Closest feature parity" },
  { value: "Same target audience", label: "Same target audience" },
  { value: "Best-in-class UX to benchmark against", label: "Best-in-class UX" },
  { value: "Strong brand recognition we're competing with", label: "Strong brand recognition" },
  { value: "Emerging disruptor in the space", label: "Emerging disruptor" },
  { value: "Open-source alternative", label: "Open-source alternative" },
  { value: "Enterprise incumbent", label: "Enterprise incumbent" },
];

const LLM_MODEL_OPTIONS: Record<string, ComboboxOption[]> = {
  claude: [
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { value: "claude-sonnet-4-5-20250514", label: "Claude Sonnet 4.5" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  ],
  ollama: [
    { value: "llama3.1", label: "Llama 3.1" },
    { value: "llama3.2", label: "Llama 3.2" },
    { value: "mistral", label: "Mistral" },
    { value: "mixtral", label: "Mixtral" },
    { value: "codellama", label: "Code Llama" },
    { value: "deepseek-coder", label: "DeepSeek Coder" },
    { value: "phi3", label: "Phi-3" },
    { value: "gemma2", label: "Gemma 2" },
  ],
  custom: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.0-pro", label: "Gemini 2.0 Pro" },
  ],
};

const MAX_TOKENS_OPTIONS: ComboboxOption[] = [
  { value: "256", label: "256 — Short reply" },
  { value: "512", label: "512 — Brief response" },
  { value: "1024", label: "1024 — Standard" },
  { value: "2048", label: "2048 — Default" },
  { value: "4096", label: "4096 — Detailed" },
  { value: "8192", label: "8192 — Long-form" },
  { value: "16384", label: "16384 — Very long" },
  { value: "32768", label: "32768 — Maximum detail" },
  { value: "65536", label: "65536 — Extended" },
  { value: "100000", label: "100000 — Max" },
];

const OUTPUT_DESTINATION_SUGGESTIONS: ComboboxOption[] = [
  { value: "output.md", label: "output.md" },
  { value: "results.json", label: "results.json" },
  { value: "POST /api/webhook", label: "POST /api/webhook" },
  { value: "console", label: "console" },
  { value: "crm://deal-update", label: "crm://deal-update" },
  { value: "crm://telegram-notify", label: "crm://telegram-notify" },
  { value: "stdout", label: "stdout" },
  { value: "slack://channel", label: "slack://channel" },
  { value: "github://issue", label: "github://issue" },
  { value: "github://pr-comment", label: "github://pr-comment" },
];

const CONFIG_FILEPATH_SUGGESTIONS: ComboboxOption[] = [
  { value: "CLAUDE.md", label: "CLAUDE.md" },
  { value: ".claude/settings.json", label: ".claude/settings.json" },
  { value: ".claude/settings.local.json", label: ".claude/settings.local.json" },
  { value: ".claude/commands/review.md", label: ".claude/commands/review.md" },
  { value: "package.json", label: "package.json" },
  { value: "tsconfig.json", label: "tsconfig.json" },
  { value: ".env", label: ".env" },
  { value: ".github/workflows/ci.yml", label: ".github/workflows/ci.yml" },
  { value: "Dockerfile", label: "Dockerfile" },
  { value: "docker-compose.yml", label: "docker-compose.yml" },
  { value: ".eslintrc.json", label: ".eslintrc.json" },
  { value: "tailwind.config.ts", label: "tailwind.config.ts" },
];

const CONDITION_SUGGESTIONS: ComboboxOption[] = [
  { value: "score > 80", label: "score > 80" },
  { value: "score > 90", label: "score > 90" },
  { value: "gap < 10", label: "gap < 10" },
  { value: "gap < 20", label: "gap < 20" },
  { value: "round <= 5", label: "round <= 5" },
  { value: "consensus >= 0.7", label: "consensus >= 0.7" },
  { value: "status === 'completed'", label: "status === 'completed'" },
  { value: "hasImprovement === true", label: "hasImprovement === true" },
  { value: "priority === 'critical'", label: "priority === 'critical'" },
];

const TRANSFORM_EXPRESSION_SUGGESTIONS: ComboboxOption[] = [
  { value: "result -> markdown", label: "result -> markdown" },
  { value: "result -> json", label: "result -> json" },
  { value: "scores -> average", label: "scores -> average" },
  { value: "scores -> weighted-average", label: "scores -> weighted-average" },
  { value: "personas -> consensus", label: "personas -> consensus" },
  { value: "gaps -> sorted-by-priority", label: "gaps -> sorted-by-priority" },
  { value: "data -> csv", label: "data -> csv" },
  { value: "responses -> merge", label: "responses -> merge" },
  { value: "text -> summary", label: "text -> summary" },
];

const STEP_FLOW_CATEGORY_OPTIONS: ComboboxOption[] = [
  { value: "team", label: "Team" },
  { value: "app", label: "App" },
  { value: "benchmark", label: "Benchmark" },
  { value: "scoring", label: "Scoring" },
  { value: "improve", label: "Improve" },
];

const STEP_STATUS_OPTIONS: ComboboxOption[] = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

const DOMAIN_EXPERT_SUGGESTIONS: ComboboxOption[] = [
  { value: "Head of Product", label: "Head of Product" },
  { value: "Engineering Lead", label: "Engineering Lead" },
  { value: "Design Lead", label: "Design Lead" },
  { value: "Growth & Analytics", label: "Growth & Analytics" },
  { value: "QA & Reliability", label: "QA & Reliability" },
  { value: "Security Expert", label: "Security Expert" },
  { value: "DevOps Lead", label: "DevOps Lead" },
  { value: "Data Scientist", label: "Data Scientist" },
  { value: "UX Researcher", label: "UX Researcher" },
  { value: "Technical Writer", label: "Technical Writer" },
];

const NOTE_TITLE_SUGGESTIONS: ComboboxOption[] = [
  { value: "TODO", label: "TODO" },
  { value: "Architecture Decision", label: "Architecture Decision" },
  { value: "Known Issue", label: "Known Issue" },
  { value: "Design Rationale", label: "Design Rationale" },
  { value: "Meeting Notes", label: "Meeting Notes" },
  { value: "Requirements", label: "Requirements" },
  { value: "Constraints", label: "Constraints" },
  { value: "Open Questions", label: "Open Questions" },
  { value: "Dependencies", label: "Dependencies" },
  { value: "Risk Assessment", label: "Risk Assessment" },
];

// ── New node Combobox options ──────────────────────────────────

const HTTP_METHOD_OPTIONS: ComboboxOption[] = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
  { value: "DELETE", label: "DELETE" },
];

const HTTP_AUTH_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
  { value: "api-key", label: "API Key" },
];

const WEBHOOK_METHOD_OPTIONS: ComboboxOption[] = [
  { value: "POST", label: "POST" },
  { value: "GET", label: "GET" },
  { value: "PUT", label: "PUT" },
  { value: "ANY", label: "ANY" },
];

const EMAIL_ACTION_OPTIONS: ComboboxOption[] = [
  { value: "send", label: "Send" },
  { value: "read", label: "Read" },
  { value: "reply", label: "Reply" },
  { value: "forward", label: "Forward" },
];

const EMAIL_FORMAT_OPTIONS: ComboboxOption[] = [
  { value: "text", label: "Plain Text" },
  { value: "html", label: "HTML" },
];

const EMAIL_PROVIDER_OPTIONS: ComboboxOption[] = [
  { value: "smtp", label: "SMTP" },
  { value: "sendgrid", label: "SendGrid" },
  { value: "resend", label: "Resend" },
];

const DB_ACTION_OPTIONS: ComboboxOption[] = [
  { value: "query", label: "Query" },
  { value: "insert", label: "Insert" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "upsert", label: "Upsert" },
];

const DB_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mongodb", label: "MongoDB" },
  { value: "supabase", label: "Supabase" },
  { value: "sqlite", label: "SQLite" },
];

const STORAGE_ACTION_OPTIONS: ComboboxOption[] = [
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "list", label: "List" },
  { value: "delete", label: "Delete" },
  { value: "copy", label: "Copy" },
];

const STORAGE_PROVIDER_OPTIONS: ComboboxOption[] = [
  { value: "local", label: "Local" },
  { value: "s3", label: "S3" },
  { value: "r2", label: "R2" },
  { value: "supabase", label: "Supabase" },
];

const JSON_ACTION_OPTIONS: ComboboxOption[] = [
  { value: "parse", label: "Parse" },
  { value: "stringify", label: "Stringify" },
  { value: "extract", label: "Extract (JSONPath)" },
  { value: "build", label: "Build" },
  { value: "validate", label: "Validate" },
];

const TEXT_ACTION_OPTIONS: ComboboxOption[] = [
  { value: "split", label: "Split" },
  { value: "join", label: "Join" },
  { value: "replace", label: "Replace" },
  { value: "truncate", label: "Truncate" },
  { value: "template", label: "Template" },
  { value: "regex", label: "Regex" },
];

const AGGREGATE_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "concat", label: "Concat" },
  { value: "sum", label: "Sum" },
  { value: "average", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "count", label: "Count" },
];

const VALIDATION_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "required", label: "Required" },
  { value: "type-check", label: "Type Check" },
  { value: "range", label: "Range" },
  { value: "regex", label: "Regex" },
  { value: "schema", label: "Schema" },
  { value: "custom", label: "Custom" },
];

const FORMAT_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML" },
  { value: "csv", label: "CSV" },
  { value: "table", label: "Table" },
  { value: "yaml", label: "YAML" },
  { value: "xml", label: "XML" },
];

const LOOP_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "forEach", label: "For Each" },
  { value: "times", label: "Times" },
  { value: "while", label: "While" },
  { value: "map", label: "Map" },
];

const MATCH_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "exact", label: "Exact" },
  { value: "contains", label: "Contains" },
  { value: "regex", label: "Regex" },
  { value: "range", label: "Range" },
  { value: "type", label: "Type" },
];

const DELAY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "fixed", label: "Fixed" },
  { value: "random", label: "Random" },
  { value: "throttle", label: "Throttle" },
  { value: "debounce", label: "Debounce" },
  { value: "cron", label: "Cron" },
];

const ERROR_ACTION_OPTIONS: ComboboxOption[] = [
  { value: "catch", label: "Catch" },
  { value: "retry", label: "Retry" },
  { value: "fallback", label: "Fallback" },
  { value: "log", label: "Log" },
  { value: "ignore", label: "Ignore" },
];

const LOG_LEVEL_OPTIONS: ComboboxOption[] = [
  { value: "error", label: "Error" },
  { value: "warn", label: "Warning" },
  { value: "info", label: "Info" },
];

const MERGE_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "waitAll", label: "Wait All" },
  { value: "firstComplete", label: "First Complete" },
  { value: "combine", label: "Combine" },
  { value: "zip", label: "Zip" },
  { value: "append", label: "Append" },
];

const MERGE_OUTPUT_OPTIONS: ComboboxOption[] = [
  { value: "array", label: "Array" },
  { value: "object", label: "Object" },
  { value: "text", label: "Text" },
];

const CLASSIFY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "sentiment", label: "Sentiment" },
  { value: "topic", label: "Topic" },
  { value: "intent", label: "Intent" },
  { value: "spam", label: "Spam" },
  { value: "language", label: "Language" },
  { value: "custom", label: "Custom" },
];

const SUMMARY_STYLE_OPTIONS: ComboboxOption[] = [
  { value: "bullets", label: "Bullet Points" },
  { value: "abstract", label: "Abstract" },
  { value: "tldr", label: "TL;DR" },
  { value: "takeaways", label: "Key Takeaways" },
  { value: "headline", label: "Headline" },
  { value: "custom", label: "Custom" },
];

const SEARCH_PROVIDER_OPTIONS: ComboboxOption[] = [
  { value: "brave", label: "Brave Search" },
  { value: "serper", label: "Serper" },
  { value: "tavily", label: "Tavily" },
  { value: "google", label: "Google" },
  { value: "bing", label: "Bing" },
];

const EMBEDDING_ACTION_OPTIONS: ComboboxOption[] = [
  { value: "embed", label: "Embed" },
  { value: "similarity", label: "Similarity" },
  { value: "cluster", label: "Cluster" },
  { value: "nearest", label: "Nearest" },
  { value: "store", label: "Store" },
];

const EMBEDDING_PROVIDER_OPTIONS: ComboboxOption[] = [
  { value: "openai", label: "OpenAI" },
  { value: "cohere", label: "Cohere" },
  { value: "voyage", label: "Voyage" },
  { value: "ollama", label: "Ollama" },
];

const EXTRACT_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "entities", label: "Entities" },
  { value: "dates", label: "Dates" },
  { value: "amounts", label: "Amounts" },
  { value: "contacts", label: "Contacts" },
  { value: "table", label: "Table" },
  { value: "custom", label: "Custom" },
];

const EXTRACT_OUTPUT_OPTIONS: ComboboxOption[] = [
  { value: "json", label: "JSON" },
  { value: "csv", label: "CSV" },
  { value: "text", label: "Text" },
];

// ── Node-specific editors ──────────────────────────────────────

function PersonaEditor({
  data,
  onChange,
}: {
  data: PersonaNodeData;
  onChange: (d: Partial<PersonaNodeData>) => void;
}) {
  return (
    <>
      <Field label="Name">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Role">
        <Combobox
          options={PERSONA_ROLE_OPTIONS}
          value={data.role}
          onChange={(v) => onChange({ role: v })}
        />
      </Field>
      <Field label="Emoji">
        <Combobox
          options={PERSONA_EMOJI_OPTIONS}
          value={data.emoji}
          onChange={(v) => onChange({ emoji: v })}
          allowCustom
        />
      </Field>
      <Field label="Vote Weight">
        <input
          type="number"
          step={0.1}
          min={0}
          max={3}
          className={inputClass}
          value={data.voteWeight}
          onChange={(e) => onChange({ voteWeight: parseFloat(e.target.value) || 0 })}
        />
      </Field>
      <Field label="Expertise (comma-separated)">
        <input
          className={inputClass}
          value={data.expertise?.join(", ") ?? ""}
          onChange={(e) =>
            onChange({
              expertise: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </Field>
      <Field label="Personality">
        <Combobox
          options={PERSONALITY_SUGGESTIONS}
          value={data.personality}
          onChange={(v) => onChange({ personality: v })}
          allowCustom
          placeholder="Type or pick a personality…"
        />
      </Field>
    </>
  );
}

function AppEditor({
  data,
  onChange,
}: {
  data: AppNodeData;
  onChange: (d: Partial<AppNodeData>) => void;
}) {
  return (
    <>
      <Field label="App Name">
        <Combobox
          options={ALL_COMPANY_OPTIONS}
          value={data.label}
          onChange={(v) => onChange({ label: v })}
          allowCustom
          placeholder="Type or search companies…"
        />
      </Field>
      <Field label="Description">
        <textarea
          className={textareaClass}
          rows={2}
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <Field label="Target Users">
        <Combobox
          options={TARGET_USERS_SUGGESTIONS}
          value={data.targetUsers}
          onChange={(v) => onChange({ targetUsers: v })}
          allowCustom
          placeholder="Type or pick a user segment…"
        />
      </Field>
      <Field label="Core Value">
        <Combobox
          options={CORE_VALUE_SUGGESTIONS}
          value={data.coreValue}
          onChange={(v) => onChange({ coreValue: v })}
          allowCustom
          placeholder="Type or pick a value prop…"
        />
      </Field>
      <Field label="Current State">
        <Combobox
          options={APP_STATE_OPTIONS}
          value={data.currentState}
          onChange={(v) => onChange({ currentState: v as AppNodeData["currentState"] })}
        />
      </Field>
    </>
  );
}

function CompetitorEditor({
  data,
  onChange,
}: {
  data: CompetitorNodeData;
  onChange: (d: Partial<CompetitorNodeData>) => void;
}) {
  return (
    <>
      <Field label="Competitor Name">
        <Combobox
          options={ALL_COMPANY_OPTIONS}
          value={data.label}
          onChange={(v) => onChange({ label: v })}
          allowCustom
          placeholder="Type or search companies…"
        />
      </Field>
      <Field label="Why this competitor?">
        <Combobox
          options={COMPETITOR_WHY_SUGGESTIONS}
          value={data.why}
          onChange={(v) => onChange({ why: v })}
          allowCustom
          placeholder="Type or pick a reason…"
        />
      </Field>
      <Field label="Overall Score">
        <input
          type="number"
          min={0}
          max={100}
          className={inputClass}
          value={data.overallScore}
          onChange={(e) => onChange({ overallScore: parseInt(e.target.value) || 0 })}
        />
      </Field>
      <Field label="CPO Name">
        <input
          className={inputClass}
          value={data.cpoName}
          placeholder="Auto-generated or custom"
          onChange={(e) => onChange({ cpoName: e.target.value })}
        />
      </Field>
    </>
  );
}

function ActionEditor({
  data,
  onChange,
}: {
  data: ActionNodeData;
  onChange: (d: Partial<ActionNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Action Type">
        <Combobox
          options={ACTION_TYPE_OPTIONS}
          value={data.actionType}
          onChange={(v) => onChange({ actionType: v as ActionNodeData["actionType"] })}
        />
      </Field>
      <Field label="Description">
        <textarea
          className={textareaClass}
          rows={2}
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
    </>
  );
}

function NoteEditor({
  data,
  onChange,
}: {
  data: NoteNodeData;
  onChange: (d: Partial<NoteNodeData>) => void;
}) {
  return (
    <>
      <Field label="Title">
        <Combobox
          options={NOTE_TITLE_SUGGESTIONS}
          value={data.label}
          onChange={(v) => onChange({ label: v })}
          allowCustom
          placeholder="Type or pick a title…"
        />
      </Field>
      <Field label="Content">
        <textarea
          className={textareaClass}
          rows={4}
          value={data.content}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      </Field>
    </>
  );
}

function TriggerEditor({
  data,
  onChange,
}: {
  data: TriggerNodeData;
  onChange: (d: Partial<TriggerNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Trigger Type">
        <Combobox
          options={TRIGGER_TYPE_OPTIONS}
          value={data.triggerType}
          onChange={(v) => onChange({ triggerType: v as TriggerNodeData["triggerType"] })}
        />
      </Field>
      <Field label="Config">
        <textarea
          className={textareaClass}
          rows={2}
          value={data.config}
          onChange={(e) => onChange({ config: e.target.value })}
        />
      </Field>
    </>
  );
}

function ConditionEditor({
  data,
  onChange,
  nodes = [],
}: {
  data: ConditionNodeData;
  onChange: (d: Partial<ConditionNodeData>) => void;
  nodes?: Node[];
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Condition">
        <ExpressionEditor
          value={data.condition}
          onChange={(v) => onChange({ condition: v })}
          nodes={nodes}
          placeholder="e.g. score > 80 or {{nodeId.output}}"
          rows={2}
        />
      </Field>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
        <span className="text-emerald-400">● True</span> = right-top handle
        <span className="text-red-400">● False</span> = right-bottom handle
      </div>
    </>
  );
}

function TransformEditor({
  data,
  onChange,
}: {
  data: TransformNodeData;
  onChange: (d: Partial<TransformNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Transform Type">
        <Combobox
          options={TRANSFORM_TYPE_OPTIONS}
          value={data.transformType}
          onChange={(v) => onChange({ transformType: v as TransformNodeData["transformType"] })}
        />
      </Field>
      <Field label="Expression">
        <Combobox
          options={TRANSFORM_EXPRESSION_SUGGESTIONS}
          value={data.expression}
          onChange={(v) => onChange({ expression: v })}
          allowCustom
          placeholder="e.g. result -> markdown"
        />
      </Field>
    </>
  );
}

function OutputEditor({
  data,
  onChange,
}: {
  data: OutputNodeData;
  onChange: (d: Partial<OutputNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Output Type">
        <Combobox
          options={OUTPUT_TYPE_OPTIONS}
          value={data.outputType}
          onChange={(v) => onChange({ outputType: v as OutputNodeData["outputType"] })}
        />
      </Field>
      <Field label="Destination">
        <Combobox
          options={OUTPUT_DESTINATION_SUGGESTIONS}
          value={data.destination}
          onChange={(v) => onChange({ destination: v })}
          allowCustom
          placeholder="e.g. output.md or POST /api/..."
        />
      </Field>
    </>
  );
}

function LLMEditor({
  data,
  onChange,
  nodes = [],
}: {
  data: LLMNodeData;
  onChange: (d: Partial<LLMNodeData>) => void;
  nodes?: Node[];
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Provider">
        <Combobox
          options={LLM_PROVIDER_OPTIONS}
          value={data.provider}
          onChange={(v) => onChange({ provider: v as LLMNodeData["provider"] })}
        />
      </Field>
      {data.provider !== "claude-code" && (
        <Field label="Model">
          <Combobox
            options={LLM_MODEL_OPTIONS[data.provider] ?? []}
            value={data.model}
            onChange={(v) => onChange({ model: v })}
            allowCustom
            placeholder="Type or pick a model…"
          />
        </Field>
      )}
      <Field label="System Prompt">
        <ExpressionEditor
          value={data.systemPrompt}
          onChange={(v) => onChange({ systemPrompt: v })}
          nodes={nodes}
          placeholder="Enter system prompt... Use {{nodeId.output}} to reference upstream data"
          rows={4}
        />
      </Field>
      <Field label="Temperature">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            className="flex-1 accent-primary"
            value={data.temperature ?? 0.7}
            onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
          />
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
            {data.temperature ?? 0.7}
          </span>
        </div>
      </Field>
      <Field label="Max Tokens">
        <Combobox
          options={MAX_TOKENS_OPTIONS}
          value={String(data.maxTokens ?? 2048)}
          onChange={(v) => onChange({ maxTokens: parseInt(v) || 2048 })}
          allowCustom
          placeholder="Type or pick a token limit…"
        />
      </Field>
    </>
  );
}

function ConfigEditor({
  data,
  onChange,
}: {
  data: ConfigNodeData;
  onChange: (d: Partial<ConfigNodeData>) => void;
}) {
  function updateSection(index: number, patch: Partial<ConfigNodeSection>) {
    const updated = data.sections.map((s, i) =>
      i === index ? { ...s, ...patch } : s
    );
    onChange({ sections: updated });
  }

  function addSection() {
    onChange({
      sections: [...data.sections, { id: `s-${Date.now()}`, title: "New Section", value: "", icon: "•" }],
    });
  }

  function removeSection(index: number) {
    onChange({ sections: data.sections.filter((_, i) => i !== index) });
  }

  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Config Type">
        <Combobox
          options={CONFIG_TYPE_OPTIONS}
          value={data.configType}
          onChange={(v) => onChange({ configType: v as ConfigNodeData["configType"] })}
        />
      </Field>
      <Field label="File Path">
        <Combobox
          options={CONFIG_FILEPATH_SUGGESTIONS}
          value={data.filePath}
          onChange={(v) => onChange({ filePath: v })}
          allowCustom
          placeholder="e.g. .claude/commands/review.md"
        />
      </Field>
      <Field label="Description">
        <textarea
          className={textareaClass}
          rows={2}
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <Field label="Gitignored">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={data.gitignored}
            onChange={(e) => onChange({ gitignored: e.target.checked })}
            className="accent-primary"
          />
          Exclude from git
        </label>
      </Field>

      {/* Sections */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Sections
          </label>
          <button
            onClick={addSection}
            className="text-[10px] font-medium text-primary hover:text-primary/80 transition"
          >
            + Add Section
          </button>
        </div>
        {data.sections.map((section, i) => (
          <div
            key={section.id ?? `idx-${i}`}
            className="rounded-lg border border-white/10 bg-white/5 p-2 space-y-1.5"
          >
            <div className="flex items-center gap-1.5">
              <input
                className="w-8 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-center text-xs"
                value={section.icon}
                onChange={(e) => updateSection(i, { icon: e.target.value })}
                maxLength={4}
                title="Icon"
              />
              <input
                className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-foreground"
                value={section.title}
                onChange={(e) => updateSection(i, { title: e.target.value })}
                placeholder="Section title"
              />
              <button
                onClick={() => removeSection(i)}
                className="text-red-400/60 hover:text-red-400 text-xs px-1 transition"
                title="Remove section"
              >
                ×
              </button>
            </div>
            <input
              className="w-full rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground"
              value={section.value}
              onChange={(e) => updateSection(i, { value: e.target.value })}
              placeholder="Section value / description"
            />
          </div>
        ))}
      </div>
    </>
  );
}

function StepEditor({
  data,
  onChange,
}: {
  data: StepNodeData;
  onChange: (d: Partial<StepNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Step Index">
        <input
          type="number"
          min={0}
          className={inputClass}
          value={data.stepIndex}
          onChange={(e) => onChange({ stepIndex: parseInt(e.target.value) || 0 })}
        />
      </Field>
      <Field label="Subtitle">
        <input
          className={inputClass}
          value={data.subtitle}
          onChange={(e) => onChange({ subtitle: e.target.value })}
        />
      </Field>
      <Field label="Status">
        <Combobox
          options={STEP_STATUS_OPTIONS}
          value={data.status}
          onChange={(v) => onChange({ status: v as StepNodeData["status"] })}
        />
      </Field>
      <Field label="Flow Category">
        <Combobox
          options={STEP_FLOW_CATEGORY_OPTIONS}
          value={data.flowCategory}
          onChange={(v) => onChange({ flowCategory: v as StepNodeData["flowCategory"] })}
        />
      </Field>
      <Field label="Summary">
        <textarea
          className={textareaClass}
          rows={2}
          value={data.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
        />
      </Field>
    </>
  );
}

function AffinityCategoryEditor({
  data,
  onChange,
}: {
  data: AffinityCategoryNodeData;
  onChange: (d: Partial<AffinityCategoryNodeData>) => void;
}) {
  return (
    <>
      <Field label="Category Name">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Weight">
        <input
          type="number"
          step={0.1}
          min={0}
          className={inputClass}
          value={data.weight}
          onChange={(e) => onChange({ weight: parseFloat(e.target.value) || 0 })}
        />
      </Field>
      <Field label="Score">
        <input
          type="number"
          min={0}
          max={100}
          className={inputClass}
          value={data.score}
          onChange={(e) => onChange({ score: parseInt(e.target.value) || 0 })}
        />
      </Field>
      <Field label="Domain Expert">
        <Combobox
          options={DOMAIN_EXPERT_SUGGESTIONS}
          value={data.domainExpert}
          onChange={(v) => onChange({ domainExpert: v })}
          allowCustom
          placeholder="Type or pick an expert…"
        />
      </Field>
    </>
  );
}

// ── Integration node editors ─────────────────────────────────

function HttpEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Method">
        <Combobox options={HTTP_METHOD_OPTIONS} value={(data.method as string) ?? "GET"} onChange={(v) => onChange({ method: v })} />
      </Field>
      <Field label="URL">
        <input className={inputClass} placeholder="https://api.example.com" value={(data.url as string) ?? ""} onChange={(e) => onChange({ url: e.target.value })} />
      </Field>
      <Field label="Headers (JSON)">
        <textarea className={textareaClass} rows={2} placeholder='{"Authorization": "Bearer ..."}' value={(data.headers as string) ?? ""} onChange={(e) => onChange({ headers: e.target.value })} />
      </Field>
      <Field label="Body">
        <textarea className={textareaClass} rows={3} placeholder="Request body with {{interpolation}}" value={(data.body as string) ?? ""} onChange={(e) => onChange({ body: e.target.value })} />
      </Field>
      <Field label="Auth Type">
        <Combobox options={HTTP_AUTH_TYPE_OPTIONS} value={(data.authType as string) ?? "none"} onChange={(v) => onChange({ authType: v })} />
      </Field>
      {(data.authType as string) !== "none" && (
        <Field label="Auth Value">
          <input className={inputClass} type="password" value={(data.authValue as string) ?? ""} onChange={(e) => onChange({ authValue: e.target.value })} />
        </Field>
      )}
      <Field label="Timeout (ms)">
        <input type="number" className={inputClass} min={1000} max={120000} value={(data.timeout as number) ?? 30000} onChange={(e) => onChange({ timeout: parseInt(e.target.value) || 30000 })} />
      </Field>
    </>
  );
}

function WebhookEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Method">
        <Combobox options={WEBHOOK_METHOD_OPTIONS} value={(data.webhookMethod as string) ?? "POST"} onChange={(v) => onChange({ webhookMethod: v })} />
      </Field>
      <Field label="Path">
        <input className={inputClass} placeholder="/webhook/my-flow" value={(data.path as string) ?? ""} onChange={(e) => onChange({ path: e.target.value })} />
      </Field>
      <Field label="HMAC Secret">
        <input className={inputClass} type="password" placeholder="Optional" value={(data.secret as string) ?? ""} onChange={(e) => onChange({ secret: e.target.value })} />
      </Field>
      <Field label="Response Code">
        <input type="number" className={inputClass} min={100} max={599} value={(data.responseCode as number) ?? 200} onChange={(e) => onChange({ responseCode: parseInt(e.target.value) || 200 })} />
      </Field>
      <Field label="Response Body">
        <textarea className={textareaClass} rows={2} value={(data.responseBody as string) ?? ""} onChange={(e) => onChange({ responseBody: e.target.value })} />
      </Field>
    </>
  );
}

function EmailEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Action">
        <Combobox options={EMAIL_ACTION_OPTIONS} value={(data.emailAction as string) ?? "send"} onChange={(v) => onChange({ emailAction: v })} />
      </Field>
      <Field label="To">
        <input className={inputClass} placeholder="user@example.com" value={(data.to as string) ?? ""} onChange={(e) => onChange({ to: e.target.value })} />
      </Field>
      <Field label="Subject">
        <input className={inputClass} value={(data.subject as string) ?? ""} onChange={(e) => onChange({ subject: e.target.value })} />
      </Field>
      <Field label="Body">
        <textarea className={textareaClass} rows={3} placeholder="Supports {{interpolation}}" value={(data.body as string) ?? ""} onChange={(e) => onChange({ body: e.target.value })} />
      </Field>
      <Field label="Format">
        <Combobox options={EMAIL_FORMAT_OPTIONS} value={(data.format as string) ?? "text"} onChange={(v) => onChange({ format: v })} />
      </Field>
      <Field label="Provider">
        <Combobox options={EMAIL_PROVIDER_OPTIONS} value={(data.provider as string) ?? "smtp"} onChange={(v) => onChange({ provider: v })} />
      </Field>
    </>
  );
}

function DatabaseEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Action">
        <Combobox options={DB_ACTION_OPTIONS} value={(data.dbAction as string) ?? "query"} onChange={(v) => onChange({ dbAction: v })} />
      </Field>
      <Field label="Database Type">
        <Combobox options={DB_TYPE_OPTIONS} value={(data.dbType as string) ?? "postgres"} onChange={(v) => onChange({ dbType: v })} />
      </Field>
      <Field label="Connection">
        <input className={inputClass} type="password" placeholder="Connection string or credential ref" value={(data.connectionString as string) ?? ""} onChange={(e) => onChange({ connectionString: e.target.value })} />
      </Field>
      <Field label="Table">
        <input className={inputClass} placeholder="users" value={(data.table as string) ?? ""} onChange={(e) => onChange({ table: e.target.value })} />
      </Field>
      <Field label="Query">
        <textarea className={textareaClass} rows={3} placeholder="SELECT * FROM users LIMIT 10" value={(data.query as string) ?? ""} onChange={(e) => onChange({ query: e.target.value })} />
      </Field>
      <Field label="Params (JSON array)">
        <textarea className={textareaClass} rows={2} placeholder="[]" value={(data.params as string) ?? "[]"} onChange={(e) => onChange({ params: e.target.value })} />
      </Field>
    </>
  );
}

function StorageEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Action">
        <Combobox options={STORAGE_ACTION_OPTIONS} value={(data.storageAction as string) ?? "read"} onChange={(v) => onChange({ storageAction: v })} />
      </Field>
      <Field label="Provider">
        <Combobox options={STORAGE_PROVIDER_OPTIONS} value={(data.provider as string) ?? "local"} onChange={(v) => onChange({ provider: v })} />
      </Field>
      <Field label="Bucket">
        <input className={inputClass} placeholder="my-bucket" value={(data.bucket as string) ?? ""} onChange={(e) => onChange({ bucket: e.target.value })} />
      </Field>
      <Field label="Path">
        <input className={inputClass} placeholder="/data/output.json" value={(data.path as string) ?? ""} onChange={(e) => onChange({ path: e.target.value })} />
      </Field>
      {(data.storageAction as string) === "write" && (
        <Field label="Content">
          <textarea className={textareaClass} rows={3} placeholder="Supports {{interpolation}}" value={(data.content as string) ?? ""} onChange={(e) => onChange({ content: e.target.value })} />
        </Field>
      )}
    </>
  );
}

// ── Data node editors ────────────────────────────────────────

function JsonEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Action">
        <Combobox options={JSON_ACTION_OPTIONS} value={(data.jsonAction as string) ?? "parse"} onChange={(v) => onChange({ jsonAction: v })} />
      </Field>
      <Field label="Expression">
        <input className={inputClass} placeholder="$.data.items" value={(data.expression as string) ?? ""} onChange={(e) => onChange({ expression: e.target.value })} />
      </Field>
      <Field label="Template">
        <textarea className={textareaClass} rows={3} placeholder="JSON template for build mode" value={(data.template as string) ?? ""} onChange={(e) => onChange({ template: e.target.value })} />
      </Field>
      <Field label="Strict Mode">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" checked={(data.strict as boolean) ?? true} onChange={(e) => onChange({ strict: e.target.checked })} className="accent-primary" />
          Strict validation
        </label>
      </Field>
    </>
  );
}

function TextProcessorEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Action">
        <Combobox options={TEXT_ACTION_OPTIONS} value={(data.textAction as string) ?? "template"} onChange={(v) => onChange({ textAction: v })} />
      </Field>
      <Field label="Delimiter">
        <input className={inputClass} value={(data.delimiter as string) ?? "\n"} onChange={(e) => onChange({ delimiter: e.target.value })} />
      </Field>
      <Field label="Pattern">
        <input className={inputClass} placeholder="Search pattern" value={(data.pattern as string) ?? ""} onChange={(e) => onChange({ pattern: e.target.value })} />
      </Field>
      <Field label="Replacement">
        <input className={inputClass} value={(data.replacement as string) ?? ""} onChange={(e) => onChange({ replacement: e.target.value })} />
      </Field>
      <Field label="Max Length (0 = no limit)">
        <input type="number" className={inputClass} min={0} value={(data.maxLength as number) ?? 0} onChange={(e) => onChange({ maxLength: parseInt(e.target.value) || 0 })} />
      </Field>
      <Field label="Template">
        <textarea className={textareaClass} rows={2} placeholder="Hello {{name}}" value={(data.template as string) ?? ""} onChange={(e) => onChange({ template: e.target.value })} />
      </Field>
    </>
  );
}

function AggregatorEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Aggregate Type">
        <Combobox options={AGGREGATE_TYPE_OPTIONS} value={(data.aggregateType as string) ?? "concat"} onChange={(v) => onChange({ aggregateType: v })} />
      </Field>
      <Field label="Separator">
        <input className={inputClass} value={(data.separator as string) ?? "\n---\n"} onChange={(e) => onChange({ separator: e.target.value })} />
      </Field>
      <Field label="Field Path">
        <input className={inputClass} placeholder="Specific field to aggregate" value={(data.field as string) ?? ""} onChange={(e) => onChange({ field: e.target.value })} />
      </Field>
    </>
  );
}

function ValidatorEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Validation Type">
        <Combobox options={VALIDATION_TYPE_OPTIONS} value={(data.validationType as string) ?? "required"} onChange={(v) => onChange({ validationType: v })} />
      </Field>
      <Field label="Field">
        <input className={inputClass} placeholder="Field to validate" value={(data.field as string) ?? ""} onChange={(e) => onChange({ field: e.target.value })} />
      </Field>
      <Field label="Rule">
        <textarea className={textareaClass} rows={2} placeholder="Regex, range (1-100), or JSON schema" value={(data.rule as string) ?? ""} onChange={(e) => onChange({ rule: e.target.value })} />
      </Field>
      <Field label="Error Message">
        <input className={inputClass} value={(data.errorMessage as string) ?? "Validation failed"} onChange={(e) => onChange({ errorMessage: e.target.value })} />
      </Field>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
        <span className="text-emerald-400">Pass</span> = right-top handle
        <span className="text-red-400">Fail</span> = right-bottom handle
      </div>
    </>
  );
}

function FormatterEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Format Type">
        <Combobox options={FORMAT_TYPE_OPTIONS} value={(data.formatType as string) ?? "markdown"} onChange={(v) => onChange({ formatType: v })} />
      </Field>
      <Field label="Template">
        <textarea className={textareaClass} rows={3} placeholder="Custom template with {{field}} placeholders" value={(data.template as string) ?? ""} onChange={(e) => onChange({ template: e.target.value })} />
      </Field>
      <Field label="Include Headers">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" checked={(data.includeHeaders as boolean) ?? true} onChange={(e) => onChange({ includeHeaders: e.target.checked })} className="accent-primary" />
          Include column headers
        </label>
      </Field>
    </>
  );
}

// ── Logic node editors ───────────────────────────────────────

function LoopEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Loop Type">
        <Combobox options={LOOP_TYPE_OPTIONS} value={(data.loopType as string) ?? "forEach"} onChange={(v) => onChange({ loopType: v })} />
      </Field>
      <Field label="Max Iterations">
        <input type="number" className={inputClass} min={1} max={10000} value={(data.maxIterations as number) ?? 100} onChange={(e) => onChange({ maxIterations: parseInt(e.target.value) || 100 })} />
      </Field>
      <Field label="Field / Count">
        <input className={inputClass} placeholder="Array field or iteration count" value={(data.field as string) ?? ""} onChange={(e) => onChange({ field: e.target.value })} />
      </Field>
      {(data.loopType as string) === "while" && (
        <Field label="Condition">
          <input className={inputClass} placeholder="e.g. index < 10" value={(data.condition as string) ?? ""} onChange={(e) => onChange({ condition: e.target.value })} />
        </Field>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
        <span className="text-blue-400">Item</span> = right-top handle
        <span className="text-emerald-400">Done</span> = right-bottom handle
      </div>
    </>
  );
}

function SwitchEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Match Type">
        <Combobox options={MATCH_TYPE_OPTIONS} value={(data.matchType as string) ?? "exact"} onChange={(v) => onChange({ matchType: v })} />
      </Field>
      <Field label="Field">
        <input className={inputClass} placeholder="Field to match on" value={(data.field as string) ?? ""} onChange={(e) => onChange({ field: e.target.value })} />
      </Field>
      <Field label="Cases (JSON array)">
        <textarea className={textareaClass} rows={2} placeholder='["case1", "case2", "default"]' value={(data.cases as string) ?? ""} onChange={(e) => onChange({ cases: e.target.value })} />
      </Field>
    </>
  );
}

function DelayEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Delay Type">
        <Combobox options={DELAY_TYPE_OPTIONS} value={(data.delayType as string) ?? "fixed"} onChange={(v) => onChange({ delayType: v })} />
      </Field>
      <Field label="Duration (ms)">
        <input type="number" className={inputClass} min={0} value={(data.duration as number) ?? 1000} onChange={(e) => onChange({ duration: parseInt(e.target.value) || 1000 })} />
      </Field>
      {(data.delayType as string) === "random" && (
        <Field label="Max Duration (ms)">
          <input type="number" className={inputClass} min={0} value={(data.maxDuration as number) ?? 5000} onChange={(e) => onChange({ maxDuration: parseInt(e.target.value) || 5000 })} />
        </Field>
      )}
      {(data.delayType as string) === "cron" && (
        <Field label="Schedule">
          <input className={inputClass} placeholder="*/5 * * * *" value={(data.schedule as string) ?? ""} onChange={(e) => onChange({ schedule: e.target.value })} />
        </Field>
      )}
    </>
  );
}

function ErrorHandlerEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Error Action">
        <Combobox options={ERROR_ACTION_OPTIONS} value={(data.errorAction as string) ?? "catch"} onChange={(v) => onChange({ errorAction: v })} />
      </Field>
      {(data.errorAction as string) === "retry" && (
        <Field label="Max Retries">
          <input type="number" className={inputClass} min={1} max={10} value={(data.maxRetries as number) ?? 3} onChange={(e) => onChange({ maxRetries: parseInt(e.target.value) || 3 })} />
        </Field>
      )}
      {(data.errorAction as string) === "fallback" && (
        <Field label="Fallback Value">
          <textarea className={textareaClass} rows={2} value={(data.fallbackValue as string) ?? ""} onChange={(e) => onChange({ fallbackValue: e.target.value })} />
        </Field>
      )}
      <Field label="Log Level">
        <Combobox options={LOG_LEVEL_OPTIONS} value={(data.logLevel as string) ?? "error"} onChange={(v) => onChange({ logLevel: v })} />
      </Field>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
        <span className="text-emerald-400">Success</span> = right-top handle
        <span className="text-red-400">Error</span> = right-bottom handle
      </div>
    </>
  );
}

function MergeEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Strategy">
        <Combobox options={MERGE_STRATEGY_OPTIONS} value={(data.mergeStrategy as string) ?? "waitAll"} onChange={(v) => onChange({ mergeStrategy: v })} />
      </Field>
      <Field label="Output Format">
        <Combobox options={MERGE_OUTPUT_OPTIONS} value={(data.outputFormat as string) ?? "object"} onChange={(v) => onChange({ outputFormat: v })} />
      </Field>
      {(data.outputFormat as string) === "text" && (
        <Field label="Separator">
          <input className={inputClass} value={(data.separator as string) ?? "\n"} onChange={(e) => onChange({ separator: e.target.value })} />
        </Field>
      )}
    </>
  );
}

// ── AI node editors ──────────────────────────────────────────

function ClassifierEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Classify Type">
        <Combobox options={CLASSIFY_TYPE_OPTIONS} value={(data.classifyType as string) ?? "sentiment"} onChange={(v) => onChange({ classifyType: v })} />
      </Field>
      {(data.classifyType as string) === "custom" && (
        <Field label="Categories (comma-separated)">
          <input className={inputClass} placeholder="positive, negative, neutral" value={(data.categories as string) ?? ""} onChange={(e) => onChange({ categories: e.target.value })} />
        </Field>
      )}
      <Field label="Confidence Threshold">
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={1} step={0.05} className="flex-1 accent-primary" value={(data.confidence as number) ?? 0.7} onChange={(e) => onChange({ confidence: parseFloat(e.target.value) })} />
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">{(data.confidence as number) ?? 0.7}</span>
        </div>
      </Field>
      <Field label="Multi-Label">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" checked={(data.multiLabel as boolean) ?? false} onChange={(e) => onChange({ multiLabel: e.target.checked })} className="accent-primary" />
          Allow multiple labels
        </label>
      </Field>
    </>
  );
}

function SummarizerEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Style">
        <Combobox options={SUMMARY_STYLE_OPTIONS} value={(data.summaryStyle as string) ?? "bullets"} onChange={(v) => onChange({ summaryStyle: v })} />
      </Field>
      <Field label="Max Length (words)">
        <input type="number" className={inputClass} min={10} max={5000} value={(data.maxLength as number) ?? 200} onChange={(e) => onChange({ maxLength: parseInt(e.target.value) || 200 })} />
      </Field>
      <Field label="Language">
        <input className={inputClass} placeholder="en" value={(data.language as string) ?? "en"} onChange={(e) => onChange({ language: e.target.value })} />
      </Field>
      {(data.summaryStyle as string) === "custom" && (
        <Field label="Custom Prompt">
          <textarea className={textareaClass} rows={3} placeholder="Describe how to summarize..." value={(data.customPrompt as string) ?? ""} onChange={(e) => onChange({ customPrompt: e.target.value })} />
        </Field>
      )}
    </>
  );
}

function SearchEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Provider">
        <Combobox options={SEARCH_PROVIDER_OPTIONS} value={(data.searchProvider as string) ?? "brave"} onChange={(v) => onChange({ searchProvider: v })} />
      </Field>
      <Field label="Query">
        <textarea className={textareaClass} rows={2} placeholder="Search query with {{interpolation}}" value={(data.query as string) ?? ""} onChange={(e) => onChange({ query: e.target.value })} />
      </Field>
      <Field label="Max Results">
        <input type="number" className={inputClass} min={1} max={50} value={(data.maxResults as number) ?? 5} onChange={(e) => onChange({ maxResults: parseInt(e.target.value) || 5 })} />
      </Field>
      <Field label="Include Snippets">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" checked={(data.includeSnippets as boolean) ?? true} onChange={(e) => onChange({ includeSnippets: e.target.checked })} className="accent-primary" />
          Include text snippets
        </label>
      </Field>
      <Field label="Safe Search">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" checked={(data.safeSearch as boolean) ?? true} onChange={(e) => onChange({ safeSearch: e.target.checked })} className="accent-primary" />
          Enable safe search
        </label>
      </Field>
    </>
  );
}

function EmbeddingEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Action">
        <Combobox options={EMBEDDING_ACTION_OPTIONS} value={(data.embeddingAction as string) ?? "embed"} onChange={(v) => onChange({ embeddingAction: v })} />
      </Field>
      <Field label="Provider">
        <Combobox options={EMBEDDING_PROVIDER_OPTIONS} value={(data.provider as string) ?? "openai"} onChange={(v) => onChange({ provider: v })} />
      </Field>
      <Field label="Model">
        <input className={inputClass} placeholder="text-embedding-3-small" value={(data.model as string) ?? ""} onChange={(e) => onChange({ model: e.target.value })} />
      </Field>
      <Field label="Dimensions">
        <input type="number" className={inputClass} min={64} max={4096} value={(data.dimensions as number) ?? 1536} onChange={(e) => onChange({ dimensions: parseInt(e.target.value) || 1536 })} />
      </Field>
    </>
  );
}

function ExtractorEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Extract Type">
        <Combobox options={EXTRACT_TYPE_OPTIONS} value={(data.extractType as string) ?? "entities"} onChange={(v) => onChange({ extractType: v })} />
      </Field>
      {(data.extractType as string) === "custom" && (
        <Field label="Fields (comma-separated)">
          <input className={inputClass} placeholder="name, email, phone" value={(data.fields as string) ?? ""} onChange={(e) => onChange({ fields: e.target.value })} />
        </Field>
      )}
      <Field label="Output Format">
        <Combobox options={EXTRACT_OUTPUT_OPTIONS} value={(data.outputFormat as string) ?? "json"} onChange={(v) => onChange({ outputFormat: v })} />
      </Field>
      <Field label="Instructions">
        <textarea className={textareaClass} rows={2} placeholder="Additional extraction instructions" value={(data.instructions as string) ?? ""} onChange={(e) => onChange({ instructions: e.target.value })} />
      </Field>
    </>
  );
}

function CredentialPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [creds, setCreds] = React.useState<Array<{ id: string; name: string; provider: string }>>([]);

  React.useEffect(() => {
    setCreds(listCredentials());
  }, []);

  return (
    <Field label="Credential">
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a credential...</option>
        {creds.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.provider})
          </option>
        ))}
      </select>
      {creds.length === 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">
          No credentials saved. Add one via the Credentials button in the header.
        </p>
      )}
    </Field>
  );
}

function HttpRequestEditor({
  data,
  onChange,
  nodes = [],
}: {
  data: HttpRequestNodeData;
  onChange: (d: Partial<HttpRequestNodeData>) => void;
  nodes?: Node[];
}) {
  const [headerKey, setHeaderKey] = React.useState("");
  const [headerVal, setHeaderVal] = React.useState("");

  function addHeader() {
    if (!headerKey.trim()) return;
    onChange({ headers: { ...data.headers, [headerKey.trim()]: headerVal } });
    setHeaderKey("");
    setHeaderVal("");
  }

  function removeHeader(key: string) {
    const next = { ...data.headers };
    delete next[key];
    onChange({ headers: next });
  }

  const methodColors: Record<string, string> = {
    GET: "text-emerald-400",
    POST: "text-blue-400",
    PUT: "text-amber-400",
    PATCH: "text-orange-400",
    DELETE: "text-red-400",
  };

  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={data.label} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Method">
        <select className={selectClass} value={data.method} onChange={(e) => onChange({ method: e.target.value as HttpRequestNodeData["method"] })}>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className={`text-[10px] font-mono mt-0.5 ${methodColors[data.method] || ""}`}>{data.method}</span>
      </Field>
      <Field label="URL">
        <ExpressionEditor
          value={data.url}
          onChange={(v) => onChange({ url: v })}
          nodes={nodes}
          placeholder="https://api.example.com/{{nodeId.output}}"
          rows={1}
        />
      </Field>
      <Field label="Headers">
        <div className="space-y-1">
          {Object.entries(data.headers || {}).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 text-[11px]">
              <span className="font-mono text-muted-foreground">{k}:</span>
              <span className="font-mono text-foreground truncate flex-1">{v}</span>
              <button onClick={() => removeHeader(k)} className="text-red-400/60 hover:text-red-400 text-xs px-1">×</button>
            </div>
          ))}
          <div className="flex gap-1">
            <input className={`${inputClass} flex-1`} value={headerKey} onChange={(e) => setHeaderKey(e.target.value)} placeholder="Key" />
            <input className={`${inputClass} flex-1`} value={headerVal} onChange={(e) => setHeaderVal(e.target.value)} placeholder="Value" />
            <button onClick={addHeader} className="rounded-md bg-primary/10 px-2 text-xs text-primary hover:bg-primary/20 transition">+</button>
          </div>
        </div>
      </Field>
      {data.method !== "GET" && (
        <>
          <Field label="Body Type">
            <select className={selectClass} value={data.bodyType} onChange={(e) => onChange({ bodyType: e.target.value as HttpRequestNodeData["bodyType"] })}>
              <option value="json">JSON</option>
              <option value="form">Form Data</option>
              <option value="raw">Raw</option>
              <option value="none">None</option>
            </select>
          </Field>
          {data.bodyType !== "none" && (
            <Field label="Body">
              <textarea className={textareaClass} rows={4} value={data.body} onChange={(e) => onChange({ body: e.target.value })} placeholder={data.bodyType === "json" ? '{"key": "value"}' : "body content"} />
            </Field>
          )}
        </>
      )}
      <Field label="Auth">
        <select className={selectClass} value={data.auth} onChange={(e) => onChange({ auth: e.target.value as HttpRequestNodeData["auth"] })}>
          <option value="none">None</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="credential">Credential Store</option>
        </select>
      </Field>
      {data.auth === "bearer" && (
        <Field label="Token">
          <input type="password" className={inputClass} value={data.authValue || ""} onChange={(e) => onChange({ authValue: e.target.value })} placeholder="Bearer token" />
        </Field>
      )}
      {data.auth === "basic" && (
        <Field label="Credentials (user:pass)">
          <input type="password" className={inputClass} value={data.authValue || ""} onChange={(e) => onChange({ authValue: e.target.value })} placeholder="username:password" />
        </Field>
      )}
      {data.auth === "credential" && (
        <CredentialPicker
          value={data.credentialId || ""}
          onChange={(id) => onChange({ credentialId: id })}
        />
      )}
      <Field label="Timeout (ms)">
        <input type="number" className={inputClass} value={data.timeout || 30000} onChange={(e) => onChange({ timeout: parseInt(e.target.value) || 30000 })} />
      </Field>
    </>
  );
}

// ── CPO Review & Re-Score editors ──────────────────────────────

const CPO_REVIEW_MODE_OPTIONS: ComboboxOption[] = [
  { value: "consensus", label: "Consensus" },
  { value: "individual", label: "Individual" },
];

function CpoReviewEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const personas = Array.isArray(data.personas) ? data.personas : [];
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Description">
        <input className={inputClass} value={(data.description as string) ?? ""} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <Field label="Review Mode">
        <Combobox options={CPO_REVIEW_MODE_OPTIONS} value={(data.reviewMode as string) ?? "consensus"} onChange={(v) => onChange({ reviewMode: v })} />
      </Field>
      <Field label="System Prompt Prefix">
        <textarea className={textareaClass} rows={4} value={(data.systemPromptPrefix as string) ?? ""} onChange={(e) => onChange({ systemPromptPrefix: e.target.value })} placeholder="Optional prefix for the system prompt..." />
      </Field>
      <Field label="Personas">
        <p className="text-xs text-muted-foreground">{personas.length} persona{personas.length !== 1 ? "s" : ""} configured</p>
      </Field>
    </>
  );
}

function RescoreEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const categoriesArr = Array.isArray(data.categories) ? data.categories as string[] : [];
  return (
    <>
      <Field label="Label">
        <input className={inputClass} value={(data.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Categories (comma-separated)">
        <input className={inputClass} placeholder="UX, Performance, Features" value={categoriesArr.join(", ")} onChange={(e) => onChange({ categories: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      </Field>
      <Field label="Show Delta">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" checked={(data.showDelta as boolean) ?? false} onChange={(e) => onChange({ showDelta: e.target.checked })} className="accent-primary" />
          Display score changes
        </label>
      </Field>
    </>
  );
}

// ── Node type display config ───────────────────────────────────

const NODE_TYPE_INFO: Record<string, { emoji: string; label: string; color: string }> = {
  personaNode: { emoji: "🧑", label: "Persona", color: "text-blue-400" },
  appNode: { emoji: "🚀", label: "App", color: "text-primary" },
  competitorNode: { emoji: "🏢", label: "Competitor", color: "text-orange-400" },
  actionNode: { emoji: "⚡", label: "Action", color: "text-purple-400" },
  noteNode: { emoji: "📌", label: "Note", color: "text-yellow-400" },
  triggerNode: { emoji: "▶", label: "Trigger", color: "text-emerald-400" },
  conditionNode: { emoji: "🔀", label: "Condition", color: "text-yellow-400" },
  transformNode: { emoji: "🔄", label: "Transform", color: "text-sky-400" },
  outputNode: { emoji: "📤", label: "Output", color: "text-emerald-400" },
  llmNode: { emoji: "🧠", label: "LLM", color: "text-violet-400" },
  configNode: { emoji: "📁", label: "Config", color: "text-violet-400" },
  stepNode: { emoji: "🔢", label: "Step", color: "text-blue-400" },
  affinityCategoryNode: { emoji: "📐", label: "Category", color: "text-amber-400" },
  httpNode: { emoji: "🌐", label: "HTTP Request", color: "text-cyan-400" },
  webhookNode: { emoji: "🔗", label: "Webhook", color: "text-teal-400" },
  emailNode: { emoji: "📧", label: "Email", color: "text-cyan-300" },
  databaseNode: { emoji: "🗄️", label: "Database", color: "text-teal-300" },
  storageNode: { emoji: "💾", label: "Storage", color: "text-cyan-500" },
  jsonNode: { emoji: "📋", label: "JSON Parser", color: "text-amber-400" },
  textNode: { emoji: "✂️", label: "Text", color: "text-yellow-400" },
  aggregatorNode: { emoji: "📊", label: "Aggregator", color: "text-amber-300" },
  validatorNode: { emoji: "✅", label: "Validator", color: "text-yellow-300" },
  formatterNode: { emoji: "🎨", label: "Formatter", color: "text-amber-500" },
  loopNode: { emoji: "🔁", label: "Loop", color: "text-rose-400" },
  switchNode: { emoji: "🔀", label: "Switch", color: "text-pink-400" },
  delayNode: { emoji: "⏱️", label: "Delay", color: "text-rose-300" },
  errorHandlerNode: { emoji: "🛡️", label: "Error Handler", color: "text-pink-300" },
  mergeNode: { emoji: "🔗", label: "Merge", color: "text-rose-500" },
  classifierNode: { emoji: "🏷️", label: "Classifier", color: "text-indigo-400" },
  summarizerNode: { emoji: "📝", label: "Summarizer", color: "text-violet-400" },
  searchNode: { emoji: "🔍", label: "Web Search", color: "text-indigo-300" },
  embeddingNode: { emoji: "🧬", label: "Embeddings", color: "text-purple-400" },
  extractorNode: { emoji: "🔬", label: "Extractor", color: "text-purple-300" },
  httpRequestNode: { emoji: "🌐", label: "HTTP Request", color: "text-cyan-400" },
  cpoReviewNode: { emoji: "👔", label: "CPO Review", color: "text-amber-400" },
  rescoreNode: { emoji: "📊", label: "Re-Score", color: "text-purple-400" },
};

// ── User Node Editor (dynamic fields from UserNodeDefinition) ──

// Cache for user-node select options to avoid recreating arrays every render
const userNodeOptionsCache = new WeakMap<string[], ComboboxOption[]>();
function getUserNodeSelectOptions(opts: string[]): ComboboxOption[] {
  let cached = userNodeOptionsCache.get(opts);
  if (!cached) {
    cached = opts.map((o) => ({ value: o, label: o }));
    userNodeOptionsCache.set(opts, cached);
  }
  return cached;
}

function UserNodeEditor({
  data,
  onChange,
}: {
  data: Record<string, unknown> & { _userNodeDef?: UserNodeDefinition };
  onChange: (d: Record<string, unknown>) => void;
}) {
  const def = data._userNodeDef;
  if (!def) {
    return (
      <Field label="Label">
        <input
          className={inputClass}
          value={(data.label as string) ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
    );
  }

  function renderField(field: UserNodeField) {
    const value = data[field.key];

    switch (field.type) {
      case "text":
        return (
          <Field key={field.key} label={field.label}>
            <input
              className={inputClass}
              value={(value as string) ?? ""}
              placeholder={field.placeholder}
              onChange={(e) => onChange({ [field.key]: e.target.value })}
            />
          </Field>
        );
      case "textarea":
        return (
          <Field key={field.key} label={field.label}>
            <textarea
              className={textareaClass}
              rows={3}
              value={(value as string) ?? ""}
              placeholder={field.placeholder}
              onChange={(e) => onChange({ [field.key]: e.target.value })}
            />
          </Field>
        );
      case "number":
        return (
          <Field key={field.key} label={field.label}>
            <input
              type="number"
              className={inputClass}
              value={(value as number) ?? 0}
              onChange={(e) => onChange({ [field.key]: parseFloat(e.target.value) || 0 })}
            />
          </Field>
        );
      case "select":
        return (
          <Field key={field.key} label={field.label}>
            <Combobox
              options={getUserNodeSelectOptions(field.options ?? [])}
              value={(value as string) ?? (field.defaultValue as string)}
              onChange={(v) => onChange({ [field.key]: v })}
            />
          </Field>
        );
      case "boolean":
        return (
          <div key={field.key} className="flex items-center justify-between py-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {field.label}
            </span>
            <button
              onClick={() => onChange({ [field.key]: !value })}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                value ? "bg-primary" : "bg-white/10"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  value ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        );
      default:
        return null;
    }
  }

  return <>{def.fields.map(renderField)}</>;
}

// ── Main component ─────────────────────────────────────────────

export function NodeInspector({
  node,
  nodes = [],
  onUpdate,
  onDelete,
  onClose,
  customNodeTypeInfo,
  customNodeEditors,
}: NodeInspectorProps) {
  const nodeData = node.data as Record<string, unknown>;
  const userDef = (nodeData._userNodeDef as UserNodeDefinition | undefined)
    ?? (nodeData._userNodeId ? getUserNodeById(nodeData._userNodeId as string) : undefined);
  const nodeType = node.type ?? "";
  const info = NODE_TYPE_INFO[nodeType]
    ?? customNodeTypeInfo?.[nodeType]
    ?? (userDef
      ? { emoji: userDef.emoji, label: userDef.label, color: "text-indigo-400" }
      : { emoji: "?", label: "Unknown", color: "text-foreground" });

  const isMobile = useIsMobile();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  useFocusTrap(panelRef, isMobile, onClose);

  // Debounce updates — accumulate partials in a ref to avoid stale closures
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = React.useRef<Record<string, unknown>>({});
  const nodeDataRef = React.useRef(node.data);
  nodeDataRef.current = node.data;

  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        // Flush pending changes on unmount
        if (Object.keys(pendingRef.current).length > 0) {
          onUpdate(node.id, { ...nodeDataRef.current, ...pendingRef.current });
          pendingRef.current = {};
        }
      }
    };
  }, [node.id, onUpdate]);

  function handleChange(partial: Record<string, unknown>) {
    Object.assign(pendingRef.current, partial);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onUpdate(node.id, { ...nodeDataRef.current, ...pendingRef.current });
      pendingRef.current = {};
    }, 150);
  }

  function renderEditor() {
    switch (node.type) {
      case "personaNode":
        return (
          <PersonaEditor
            data={node.data as PersonaNodeData}
            onChange={handleChange}
          />
        );
      case "appNode":
        return (
          <AppEditor data={node.data as AppNodeData} onChange={handleChange} />
        );
      case "competitorNode":
        return (
          <CompetitorEditor
            data={node.data as CompetitorNodeData}
            onChange={handleChange}
          />
        );
      case "actionNode":
        return (
          <ActionEditor
            data={node.data as ActionNodeData}
            onChange={handleChange}
          />
        );
      case "noteNode":
        return (
          <NoteEditor data={node.data as NoteNodeData} onChange={handleChange} />
        );
      case "triggerNode":
        return (
          <TriggerEditor
            data={node.data as TriggerNodeData}
            onChange={handleChange}
          />
        );
      case "conditionNode":
        return (
          <ConditionEditor
            data={node.data as ConditionNodeData}
            onChange={handleChange}
            nodes={nodes}
          />
        );
      case "transformNode":
        return (
          <TransformEditor
            data={node.data as TransformNodeData}
            onChange={handleChange}
          />
        );
      case "outputNode":
        return (
          <OutputEditor
            data={node.data as OutputNodeData}
            onChange={handleChange}
          />
        );
      case "llmNode":
        return (
          <LLMEditor data={node.data as LLMNodeData} onChange={handleChange} nodes={nodes} />
        );
      case "configNode":
        return (
          <ConfigEditor
            data={node.data as ConfigNodeData}
            onChange={handleChange}
          />
        );
      case "stepNode":
        return (
          <StepEditor
            data={node.data as StepNodeData}
            onChange={handleChange}
          />
        );
      case "affinityCategoryNode":
        return (
          <AffinityCategoryEditor
            data={node.data as AffinityCategoryNodeData}
            onChange={handleChange}
          />
        );
      case "httpNode":
        return <HttpEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "webhookNode":
        return <WebhookEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "emailNode":
        return <EmailEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "databaseNode":
        return <DatabaseEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "storageNode":
        return <StorageEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "jsonNode":
        return <JsonEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "textNode":
        return <TextProcessorEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "aggregatorNode":
        return <AggregatorEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "validatorNode":
        return <ValidatorEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "formatterNode":
        return <FormatterEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "loopNode":
        return <LoopEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "switchNode":
        return <SwitchEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "delayNode":
        return <DelayEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "errorHandlerNode":
        return <ErrorHandlerEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "mergeNode":
        return <MergeEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "classifierNode":
        return <ClassifierEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "summarizerNode":
        return <SummarizerEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "searchNode":
        return <SearchEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "embeddingNode":
        return <EmbeddingEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "extractorNode":
        return <ExtractorEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "httpRequestNode":
        return (
          <HttpRequestEditor
            data={node.data as HttpRequestNodeData}
            onChange={handleChange}
            nodes={nodes}
          />
        );
      case "cpoReviewNode":
        return <CpoReviewEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      case "rescoreNode":
        return <RescoreEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
      default: {
        // Check custom editors injected by host app
        const CustomEditor = customNodeEditors?.[node.type ?? ""];
        if (CustomEditor) {
          return <CustomEditor data={node.data as Record<string, unknown>} onChange={handleChange} />;
        }
        // Check if this is a user-created node
        const d = node.data as Record<string, unknown>;
        if (d._userNodeId || d._userNodeDef) {
          return (
            <UserNodeEditor
              data={d as Record<string, unknown> & { _userNodeDef?: UserNodeDefinition }}
              onChange={handleChange}
            />
          );
        }
        return (
          <p className="text-xs text-muted-foreground">
            No editor available for this node type.
          </p>
        );
      }
    }
  }

  const { sheetRef: inspectorSheetRef, handleProps: inspectorSwipeProps } = useSwipeToDismiss(onClose);

  // Lock body scroll when bottom sheet is open on mobile
  React.useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile]);

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{info.emoji}</span>
          <span className={`text-sm font-semibold ${info.color}`}>
            {info.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
          aria-label="Close inspector"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 3L11 11M11 3L3 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {renderEditor()}
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 px-4 py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={() => onDelete(node.id)}
          className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition"
        >
          Delete Node
        </button>
        <div className="mt-2 text-center text-[10px] text-muted-foreground">
          ID: {node.id}
        </div>
      </div>
    </>
  );

  // Mobile: bottom sheet overlay
  if (isMobile) {
    return (
      <>
        <div className="absolute inset-0 z-40 bg-black/40" onClick={onClose} />
        <div
          ref={(el) => {
            (inspectorSheetRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          }}
          role="dialog"
          aria-modal={true}
          aria-label={`Edit ${info.label} node`}
          className="absolute left-0 right-0 bottom-0 z-50 flex max-h-[75vh] flex-col rounded-t-2xl border-t border-white/10 bg-background"
        >
          <div className="flex justify-center py-2 cursor-grab active:cursor-grabbing" {...inspectorSwipeProps}>
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>
          {content}
        </div>
      </>
    );
  }

  // Desktop: side panel (collapsible)
  if (collapsed) {
    return (
      <div ref={panelRef} className="flex h-full w-10 flex-col items-center border-l border-white/10 bg-background/95 backdrop-blur-sm py-3 gap-2" data-tour="inspector">
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition"
          title="Expand inspector"
          aria-label="Expand inspector"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-base">{info.emoji}</span>
        <span className={`text-[9px] font-medium ${info.color} [writing-mode:vertical-rl] rotate-180`}>
          {info.label}
        </span>
        <button
          onClick={onClose}
          className="mt-auto flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition"
          title="Close inspector"
          aria-label="Close inspector"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="flex h-full w-[300px] flex-col border-l border-white/10 bg-background/95 backdrop-blur-sm" data-tour="inspector">
      {/* Collapse toggle in header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{info.emoji}</span>
          <span className={`text-sm font-semibold ${info.color}`}>
            {info.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
            title="Collapse panel"
            aria-label="Collapse inspector"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
            aria-label="Close inspector"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {renderEditor()}
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 px-4 py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={() => onDelete(node.id)}
          className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition"
        >
          Delete Node
        </button>
        <div className="mt-2 text-center text-[10px] text-muted-foreground">
          ID: {node.id}
        </div>
      </div>
    </div>
  );
}
