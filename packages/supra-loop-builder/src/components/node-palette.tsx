"use client";

import * as React from "react";
import { useIsMobile } from "../hooks/use-mobile";
import { useSwipeToDismiss } from "../hooks/use-touch-device";
import { getUserNodes, buildUserNodeDefaults, type UserNodeDefinition } from "../lib/user-nodes";

const PALETTE_ITEMS = [
  // ── Core nodes ──
  {
    type: "personaNode",
    label: "Persona",
    emoji: "👤",
    description: "AI team member",
    help: "Create an AI persona with role, expertise, and weighted voting power",
    group: "core",
    data: {
      label: "New Persona",
      role: "Team Member",
      voteWeight: 1.0,
      expertise: [],
      personality: "",
      emoji: "👤",
    },
  },
  {
    type: "appNode",
    label: "App",
    emoji: "🚀",
    description: "Your application",
    help: "Define the app you're building — name, stack, users, and current state",
    group: "core",
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
    emoji: "🏢",
    description: "Reference app",
    help: "Add a competitor app to benchmark against with scoring",
    group: "core",
    data: {
      label: "Competitor",
      why: "",
      overallScore: 0,
      cpoName: "",
    },
  },
  {
    type: "actionNode",
    label: "Action",
    emoji: "⚡",
    description: "Workflow step",
    help: "Execute an action like scoring, analysis, or custom logic",
    group: "core",
    data: {
      label: "Action",
      actionType: "score",
      description: "",
    },
  },
  {
    type: "noteNode",
    label: "Note",
    emoji: "📌",
    description: "Annotation",
    help: "Add a sticky note for documentation — not executed",
    group: "core",
    data: {
      label: "Note",
      content: "",
    },
  },
  // ── Workflow nodes ──
  {
    type: "triggerNode",
    label: "Trigger",
    emoji: "▶",
    description: "Start a workflow",
    help: "Entry point — every workflow needs at least one trigger",
    group: "workflow",
    data: {
      label: "Trigger",
      triggerType: "manual",
      config: "",
    },
  },
  {
    type: "conditionNode",
    label: "Condition",
    emoji: "🔀",
    description: "Branch logic",
    help: "If/else branching — route flow based on expressions",
    group: "workflow",
    data: {
      label: "If / Else",
      condition: "",
    },
  },
  {
    type: "transformNode",
    label: "Transform",
    emoji: "🔄",
    description: "Transform data",
    help: "Map, filter, or reshape data between steps",
    group: "workflow",
    data: {
      label: "Transform",
      transformType: "map",
      expression: "",
    },
  },
  {
    type: "outputNode",
    label: "Output",
    emoji: "📤",
    description: "Send results",
    help: "Terminal node — log, webhook, or export results",
    group: "workflow",
    data: {
      label: "Output",
      outputType: "log",
      destination: "",
    },
  },
  {
    type: "llmNode",
    label: "LLM",
    emoji: "🧠",
    description: "AI / Claude node",
    help: "Call Claude or other LLMs with custom prompts",
    group: "workflow",
    data: {
      label: "Claude",
      provider: "claude",
      model: "claude-sonnet-4-5-20250514",
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 2048,
    },
  },
  {
    type: "stepNode",
    label: "Step",
    emoji: "🔢",
    description: "Pipeline step",
    help: "Ordered step in a multi-stage pipeline",
    group: "workflow",
    data: {
      label: "Step",
      stepIndex: 0,
      subtitle: "",
      status: "pending",
      summary: "",
      flowCategory: "team",
    },
  },
  {
    type: "consensusNode",
    label: "Consensus",
    emoji: "🗳️",
    description: "Persona group bucket",
    help: "Aggregate persona votes into a consensus score",
    group: "workflow",
    data: {
      label: "Consensus",
      personas: [],
      consensusScore: 0,
    },
  },
  {
    type: "affinityCategoryNode",
    label: "Category",
    emoji: "📐",
    description: "Scoring category",
    help: "Weighted scoring dimension with domain expert",
    group: "workflow",
    data: {
      label: "Category",
      weight: 0.1,
      score: 0,
      domainExpert: "",
    },
  },
  {
    type: "configNode",
    label: "Config",
    emoji: "📁",
    description: "Project config node",
    help: "Reference a project config file (package.json, tsconfig, etc.)",
    group: "workflow",
    data: {
      label: "Config File",
      configType: "root",
      filePath: "",
      description: "",
      gitignored: false,
      sections: [],
    },
  },
  // ── Integration nodes ──
  {
    type: "httpNode",
    label: "HTTP Request",
    emoji: "🌐",
    description: "Make API calls",
    help: "Send HTTP requests to any API — GET, POST, PUT, DELETE with headers and body",
    group: "integration",
    data: {
      label: "HTTP Request",
      method: "GET",
      url: "https://api.example.com",
      headers: "",
      body: "",
      timeout: 30000,
      authType: "none",
      authValue: "",
    },
  },
  {
    type: "webhookNode",
    label: "Webhook",
    emoji: "🔗",
    description: "Receive HTTP calls",
    help: "Listen for incoming webhook requests — use as a trigger or mid-flow receiver",
    group: "integration",
    data: {
      label: "Webhook Listener",
      webhookMethod: "POST",
      path: "/webhook/my-flow",
      secret: "",
      responseCode: 200,
      responseBody: '{"ok": true}',
    },
  },
  {
    type: "emailNode",
    label: "Email",
    emoji: "📧",
    description: "Send & read email",
    help: "Send emails via SMTP or read from IMAP — supports HTML templates",
    group: "integration",
    data: {
      label: "Send Email",
      emailAction: "send",
      to: "",
      subject: "",
      body: "",
      format: "text",
      provider: "smtp",
    },
  },
  {
    type: "databaseNode",
    label: "Database",
    emoji: "🗄️",
    description: "Query databases",
    help: "Read or write data from Postgres, MySQL, MongoDB, or Supabase",
    group: "integration",
    data: {
      label: "Database Query",
      dbAction: "query",
      dbType: "postgres",
      connectionString: "",
      table: "",
      query: "SELECT * FROM users LIMIT 10",
      params: "[]",
    },
  },
  {
    type: "storageNode",
    label: "Storage",
    emoji: "💾",
    description: "File & object storage",
    help: "Read or write files to S3, R2, local filesystem, or Supabase Storage",
    group: "integration",
    data: {
      label: "File Storage",
      storageAction: "read",
      provider: "local",
      bucket: "",
      path: "/data/output.json",
      content: "",
    },
  },
  // ── Data nodes ──
  {
    type: "jsonNode",
    label: "JSON Parser",
    emoji: "📋",
    description: "Parse & build JSON",
    help: "Parse JSON strings, build JSON objects, or extract fields with JSONPath",
    group: "data",
    data: {
      label: "JSON Parser",
      jsonAction: "parse",
      expression: "$.data.items",
      template: "",
      strict: true,
    },
  },
  {
    type: "textNode",
    label: "Text",
    emoji: "✂️",
    description: "Text processing",
    help: "Split, join, replace, truncate, or template text data",
    group: "data",
    data: {
      label: "Text Processor",
      textAction: "template",
      delimiter: "\n",
      pattern: "",
      replacement: "",
      maxLength: 0,
      template: "Hello {{name}}, your score is {{score}}",
    },
  },
  {
    type: "aggregatorNode",
    label: "Aggregator",
    emoji: "📊",
    description: "Combine & reduce",
    help: "Collect outputs from multiple upstream nodes and aggregate them",
    group: "data",
    data: {
      label: "Aggregator",
      aggregateType: "concat",
      separator: "\n---\n",
      field: "",
    },
  },
  {
    type: "validatorNode",
    label: "Validator",
    emoji: "✅",
    description: "Validate data",
    help: "Check data against rules — required fields, types, ranges, regex patterns",
    group: "data",
    data: {
      label: "Validator",
      validationType: "required",
      field: "",
      rule: "",
      errorMessage: "Validation failed",
    },
  },
  {
    type: "formatterNode",
    label: "Formatter",
    emoji: "🎨",
    description: "Format output",
    help: "Format data as Markdown, HTML, CSV, table, or custom template",
    group: "data",
    data: {
      label: "Formatter",
      formatType: "markdown",
      template: "",
      includeHeaders: true,
    },
  },
  // ── Logic nodes ──
  {
    type: "loopNode",
    label: "Loop",
    emoji: "🔁",
    description: "Iterate over items",
    help: "Loop through arrays or repeat N times — processes each item through connected nodes",
    group: "logic",
    data: {
      label: "Loop",
      loopType: "forEach",
      maxIterations: 100,
      field: "",
      condition: "",
    },
  },
  {
    type: "switchNode",
    label: "Switch",
    emoji: "🔀",
    description: "Multi-way routing",
    help: "Route to different branches based on value matching — like a switch/case statement",
    group: "logic",
    data: {
      label: "Switch",
      matchType: "exact",
      field: "",
      cases: '["case1", "case2", "default"]',
    },
  },
  {
    type: "delayNode",
    label: "Delay",
    emoji: "⏱️",
    description: "Wait & throttle",
    help: "Pause execution for a duration, throttle rate, or wait for a condition",
    group: "logic",
    data: {
      label: "Delay",
      delayType: "fixed",
      duration: 1000,
      maxDuration: 5000,
      schedule: "",
    },
  },
  {
    type: "errorHandlerNode",
    label: "Error Handler",
    emoji: "🛡️",
    description: "Catch errors",
    help: "Wrap nodes in try/catch — handle failures with fallbacks or retries",
    group: "logic",
    data: {
      label: "Error Handler",
      errorAction: "catch",
      maxRetries: 3,
      fallbackValue: "",
      logLevel: "error",
    },
  },
  {
    type: "mergeNode",
    label: "Merge",
    emoji: "🔗",
    description: "Join branches",
    help: "Wait for multiple upstream branches and combine their outputs",
    group: "logic",
    data: {
      label: "Merge",
      mergeStrategy: "waitAll",
      outputFormat: "object",
      separator: "\n",
    },
  },
  // ── AI nodes ──
  {
    type: "classifierNode",
    label: "Classifier",
    emoji: "🏷️",
    description: "Categorize text",
    help: "Use AI to classify text into categories — sentiment, topic, intent, or custom labels",
    group: "ai",
    data: {
      label: "Classifier",
      classifyType: "sentiment",
      categories: "",
      confidence: 0.7,
      multiLabel: false,
    },
  },
  {
    type: "summarizerNode",
    label: "Summarizer",
    emoji: "📝",
    description: "Summarize text",
    help: "AI-powered summarization — bullet points, abstract, TL;DR, or key takeaways",
    group: "ai",
    data: {
      label: "Summarizer",
      summaryStyle: "bullets",
      maxLength: 200,
      language: "en",
      customPrompt: "",
    },
  },
  {
    type: "searchNode",
    label: "Web Search",
    emoji: "🔍",
    description: "Search the web",
    help: "Query web search APIs and return results with URLs and snippets — the Perplexity DNA",
    group: "ai",
    data: {
      label: "Web Search",
      searchProvider: "brave",
      query: "",
      maxResults: 5,
      includeSnippets: true,
      safeSearch: true,
    },
  },
  {
    type: "embeddingNode",
    label: "Embeddings",
    emoji: "🧬",
    description: "Vector embeddings",
    help: "Generate text embeddings for similarity search, clustering, or RAG pipelines",
    group: "ai",
    data: {
      label: "Embeddings",
      embeddingAction: "embed",
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
    },
  },
  {
    type: "extractorNode",
    label: "Extractor",
    emoji: "🔬",
    description: "Extract structured data",
    help: "Use AI to extract entities, dates, amounts, contacts, or custom fields from text",
    group: "ai",
    data: {
      label: "Extractor",
      extractType: "entities",
      fields: "",
      outputFormat: "json",
      instructions: "",
    },
  },
  {
    type: "httpRequestNode",
    label: "HTTP Request",
    emoji: "🌐",
    description: "Call external APIs",
    help: "Make HTTP requests to external APIs with method, headers, auth, and body",
    group: "workflow",
    data: {
      label: "HTTP Request",
      method: "GET",
      url: "",
      headers: {},
      body: "",
      bodyType: "json",
      auth: "none",
      authValue: "",
      credentialId: "",
      timeout: 30000,
    },
  },
  // ── Bridge nodes (Loop ↔ Builder) ──
  {
    type: "cpoReviewNode",
    label: "CPO Review",
    emoji: "👔",
    description: "Multi-persona product review",
    help: "Run text through multiple CPO personas in parallel, returning individual scores and a consensus rating",
    group: "ai",
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
    emoji: "📊",
    description: "Before/after comparison",
    help: "Re-run scoring after improvements and show delta — connects the improvement loop back to the builder",
    group: "ai",
    data: {
      label: "Re-Score",
      categories: [],
      showDelta: true,
    },
  },
];

export { PALETTE_ITEMS };

type NodePaletteProps = {
  onAddNode?: (type: string, data: Record<string, unknown>) => void;
  /** External user node definitions (kept in sync by parent) */
  userNodeDefs?: UserNodeDefinition[];
  /** Custom palette items injected by the host app */
  customPaletteItems?: import("../types").CustomPaletteItem[];
};

export function NodePalette({ onAddNode, userNodeDefs: externalDefs, customPaletteItems }: NodePaletteProps) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = React.useState(!isMobile);
  const { sheetRef, handleProps: swipeProps } = useSwipeToDismiss(() => setExpanded(false));
  const [coreExpanded, setCoreExpanded] = React.useState(true);
  const [workflowExpanded, setWorkflowExpanded] = React.useState(true);
  const [integrationExpanded, setIntegrationExpanded] = React.useState(true);
  const [dataExpanded, setDataExpanded] = React.useState(true);
  const [logicExpanded, setLogicExpanded] = React.useState(true);
  const [aiExpanded, setAiExpanded] = React.useState(true);
  const [userExpanded, setUserExpanded] = React.useState(true);
  const [customGroupsExpanded, setCustomGroupsExpanded] = React.useState<Record<string, boolean>>({});
  // Suppress onClick when a drag just completed (mouseup after drop fires onClick)
  const didDragRef = React.useRef(false);

  // Group custom palette items by their group name
  const customGroups = React.useMemo(() => {
    if (!customPaletteItems?.length) return [];
    const groups = new Map<string, typeof customPaletteItems>();
    for (const item of customPaletteItems) {
      const g = groups.get(item.group) ?? [];
      g.push(item);
      groups.set(item.group, g);
    }
    return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
  }, [customPaletteItems]);

  // Use external defs if provided, otherwise load from storage
  const [localDefs, setLocalDefs] = React.useState<UserNodeDefinition[]>([]);
  React.useEffect(() => {
    if (!externalDefs) setLocalDefs(getUserNodes());
  }, [externalDefs]);
  const userDefs = externalDefs ?? localDefs;

  // On mobile, start collapsed
  React.useEffect(() => {
    if (isMobile) setExpanded(false);
  }, [isMobile]);

  // Lock body scroll when bottom sheet is open on mobile
  React.useEffect(() => {
    if (!isMobile || !expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, expanded]);

  function onDragStart(
    event: React.DragEvent,
    type: string,
    data: Record<string, unknown>
  ) {
    didDragRef.current = true;
    event.dataTransfer.setData("application/reactflow-type", type);
    event.dataTransfer.setData("application/reactflow-data", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  }

  function handleItemClick(type: string, data: Record<string, unknown>) {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    onAddNode?.(type, data);
    if (isMobile) setExpanded(false);
  }

  const coreItems = PALETTE_ITEMS.filter((i) => i.group === "core");
  const workflowItems = PALETTE_ITEMS.filter((i) => i.group === "workflow");
  const integrationItems = PALETTE_ITEMS.filter((i) => i.group === "integration");
  const dataItems = PALETTE_ITEMS.filter((i) => i.group === "data");
  const logicItems = PALETTE_ITEMS.filter((i) => i.group === "logic");
  const aiItems = PALETTE_ITEMS.filter((i) => i.group === "ai");

  function renderItem(item: { type: string; label: string; emoji: string; description: string; help?: string; data: Record<string, unknown> }) {
    return (
      <div
        key={`${item.type}-${item.label}`}
        role="button"
        tabIndex={0}
        aria-label={`Add ${item.label} node: ${item.description}`}
        draggable={!isMobile}
        onDragStart={isMobile ? undefined : (e) => onDragStart(e, item.type, item.data)}
        onDragEnd={isMobile ? undefined : () => { setTimeout(() => { didDragRef.current = false; }, 0); }}
        onClick={() => handleItemClick(item.type, item.data)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleItemClick(item.type, item.data); } }}
        title={item.help}
        className={`group/item flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs border border-transparent transition ${
          isMobile
            ? "cursor-pointer active:bg-primary/10 active:border-primary/30"
            : "cursor-grab hover:bg-white/8 hover:border-white/10 active:cursor-grabbing active:scale-[0.97]"
        }`}
      >
        <span className="text-base">{item.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground">{item.label}</div>
          <div className="text-xs text-muted-foreground">{item.description}</div>
        </div>
        {isMobile ? (
          <span className="text-[10px] text-primary font-medium">+ Add</span>
        ) : (
          <svg className="w-3 h-3 text-muted-foreground/30 group-hover/item:text-muted-foreground/60 transition shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
            <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
          </svg>
        )}
      </div>
    );
  }

  function renderUserNode(def: UserNodeDefinition) {
    return (
      <div
        key={def.id}
        role="button"
        tabIndex={0}
        aria-label={`Add ${def.label} node: ${def.description || "Custom node"}`}
        draggable={!isMobile}
        onDragStart={isMobile ? undefined : (e) => onDragStart(e, def.nodeType, buildUserNodeDefaults(def))}
        onDragEnd={isMobile ? undefined : () => { setTimeout(() => { didDragRef.current = false; }, 0); }}
        onClick={() => handleItemClick(def.nodeType, buildUserNodeDefaults(def))}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleItemClick(def.nodeType, buildUserNodeDefaults(def)); } }}
        title={def.description || def.label}
        className={`group/item flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs border border-transparent transition ${
          isMobile
            ? "cursor-pointer active:bg-primary/10 active:border-primary/30"
            : "cursor-grab hover:bg-white/8 hover:border-white/10 active:cursor-grabbing active:scale-[0.97]"
        }`}
      >
        <span className="text-base">{def.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground">{def.label}</div>
          <div className="text-xs text-muted-foreground">{def.description || "Custom node"}</div>
        </div>
        {isMobile ? (
          <span className="text-[10px] text-primary font-medium">+ Add</span>
        ) : (
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: def.color }}
          />
        )}
      </div>
    );
  }

  // ── Mobile: bottom sheet with FAB ──
  if (isMobile) {
    return (
      <>
        {/* FAB button */}
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="absolute left-3 bottom-3 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition"
            aria-label="Add node"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        )}

        {/* Bottom sheet overlay */}
        {expanded && (
          <>
            <div
              className="absolute inset-0 z-30 bg-black/40"
              onClick={() => setExpanded(false)}
            />
            <div ref={sheetRef} className="absolute left-0 right-0 bottom-0 z-40 max-h-[70vh] rounded-t-2xl border-t border-white/10 bg-background overflow-y-auto">
              {/* Handle bar — swipe down to dismiss */}
              <div className="flex justify-center py-2 cursor-grab active:cursor-grabbing" {...swipeProps}>
                <div className="h-1 w-10 rounded-full bg-white/20" />
              </div>
              <div className="px-3 pb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Add Node</span>
                <button
                  onClick={() => setExpanded(false)}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-3 pb-4 space-y-1">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Core</div>
                {coreItems.map(renderItem)}
                <div className="my-1 border-t border-white/5" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workflow</div>
                {workflowItems.map(renderItem)}
                <div className="my-1 border-t border-white/5" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Integration</div>
                {integrationItems.map(renderItem)}
                <div className="my-1 border-t border-white/5" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data</div>
                {dataItems.map(renderItem)}
                <div className="my-1 border-t border-white/5" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Logic</div>
                {logicItems.map(renderItem)}
                <div className="my-1 border-t border-white/5" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI</div>
                {aiItems.map(renderItem)}
                {customGroups.map((g) => (
                  <React.Fragment key={g.name}>
                    <div className="my-1 border-t border-white/5" />
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.name}</div>
                    {g.items.map(renderItem)}
                  </React.Fragment>
                ))}
                {userDefs.length > 0 && (
                  <>
                    <div className="my-1 border-t border-white/5" />
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">My Nodes</div>
                    {userDefs.map(renderUserNode)}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // ── Desktop: floating palette ──
  if (!expanded) {
    // Collapsed: compact icon button
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-background/95 backdrop-blur-sm shadow-xl text-foreground hover:bg-white/10 transition"
        title="Open node palette"
        aria-label="Open node palette"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-background/95 backdrop-blur-sm shadow-xl max-h-[80vh] overflow-y-auto w-[240px]">
      <button
        onClick={() => setExpanded(false)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-white/5 rounded-t-xl transition"
      >
        <span>▼</span>
        <span>Nodes</span>
        <span className="ml-auto text-muted-foreground/50">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </span>
      </button>
      {expanded && (
        <div className="border-t border-white/10 p-2 space-y-1">
          <button
            onClick={() => setCoreExpanded((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
          >
            <span className="text-[8px]">{coreExpanded ? "▼" : "▶"}</span>
            <span>Core</span>
            <span className="ml-auto text-muted-foreground/50">{coreItems.length}</span>
          </button>
          {coreExpanded && coreItems.map(renderItem)}
          <div className="my-1 border-t border-white/5" />
          <button
            onClick={() => setWorkflowExpanded((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
          >
            <span className="text-[8px]">{workflowExpanded ? "▼" : "▶"}</span>
            <span>Workflow</span>
            <span className="ml-auto text-muted-foreground/50">{workflowItems.length}</span>
          </button>
          {workflowExpanded && workflowItems.map(renderItem)}
          <div className="my-1 border-t border-white/5" />
          <button
            onClick={() => setIntegrationExpanded((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
          >
            <span className="text-[8px]">{integrationExpanded ? "▼" : "▶"}</span>
            <span>Integration</span>
            <span className="ml-auto text-muted-foreground/50">{integrationItems.length}</span>
          </button>
          {integrationExpanded && integrationItems.map(renderItem)}
          <div className="my-1 border-t border-white/5" />
          <button
            onClick={() => setDataExpanded((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
          >
            <span className="text-[8px]">{dataExpanded ? "▼" : "▶"}</span>
            <span>Data</span>
            <span className="ml-auto text-muted-foreground/50">{dataItems.length}</span>
          </button>
          {dataExpanded && dataItems.map(renderItem)}
          <div className="my-1 border-t border-white/5" />
          <button
            onClick={() => setLogicExpanded((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
          >
            <span className="text-[8px]">{logicExpanded ? "▼" : "▶"}</span>
            <span>Logic</span>
            <span className="ml-auto text-muted-foreground/50">{logicItems.length}</span>
          </button>
          {logicExpanded && logicItems.map(renderItem)}
          <div className="my-1 border-t border-white/5" />
          <button
            onClick={() => setAiExpanded((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
          >
            <span className="text-[8px]">{aiExpanded ? "▼" : "▶"}</span>
            <span>AI</span>
            <span className="ml-auto text-muted-foreground/50">{aiItems.length}</span>
          </button>
          {aiExpanded && aiItems.map(renderItem)}
          {/* ── Custom Groups (injected by host app) ── */}
          {customGroups.map((g) => {
            const isExpanded = customGroupsExpanded[g.name] !== false;
            return (
              <React.Fragment key={g.name}>
                <div className="my-1 border-t border-white/5" />
                <button
                  onClick={() => setCustomGroupsExpanded((prev) => ({ ...prev, [g.name]: !isExpanded }))}
                  className="flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
                >
                  <span className="text-[8px]">{isExpanded ? "▼" : "▶"}</span>
                  <span>{g.name}</span>
                  <span className="ml-auto text-muted-foreground/50">{g.items.length}</span>
                </button>
                {isExpanded && g.items.map(renderItem)}
              </React.Fragment>
            );
          })}
          {/* ── User Nodes ── */}
          {userDefs.length > 0 && (
            <>
              <div className="my-1 border-t border-white/5" />
              <button
                onClick={() => setUserExpanded((v) => !v)}
                className="flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
              >
                <span className="text-[8px]">{userExpanded ? "▼" : "▶"}</span>
                <span>My Nodes</span>
                <span className="ml-auto text-muted-foreground/50">{userDefs.length}</span>
              </button>
              {userExpanded && userDefs.map(renderUserNode)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
