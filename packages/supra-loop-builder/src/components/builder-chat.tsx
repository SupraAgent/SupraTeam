"use client";

import * as React from "react";
import { Button } from "../ui/button";
import type { Node, Edge } from "@xyflow/react";
import type { FlowTemplate } from "../lib/flow-templates";
import { saveCustomTemplate } from "../lib/flow-templates";
import type { FlowChatHandler } from "../types";
import {
  getUserNodes,
  saveUserNode,
  deleteUserNode,
  createUserNodeDefinition,
  type UserNodeDefinition,
} from "../lib/user-nodes";
import { buildCanvasSummary } from "../lib/canvas-summary";
import { uid, sanitizeErrorMessage } from "../lib/utils";

// ── Types ────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  flowUpdate?: { nodes: Node[]; edges: Edge[] };
  userNodeCreated?: UserNodeDefinition;
};

type BuilderChatProps = {
  currentNodes: Node[];
  currentEdges: Edge[];
  category: FlowTemplate["category"];
  onApplyFlow: (nodes: Node[], edges: Edge[]) => void;
  onUserNodeCreated?: () => void;
  onChat?: FlowChatHandler;
  apiKey?: string;
  storageKeyPrefix?: string;
};


// ── Validate and create user-node definition from structured API response ──

const VALID_FIELD_TYPES = new Set(["text", "textarea", "number", "select", "boolean"]);

function createUserNodeFromResponse(
  raw: Record<string, unknown> | null | undefined
): UserNodeDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.label || typeof raw.label !== "string") return null;

  // Validate fields array
  let fields: UserNodeDefinition["fields"] | undefined;
  if (Array.isArray(raw.fields)) {
    fields = raw.fields.filter(
      (f: Record<string, unknown>) =>
        f &&
        typeof f === "object" &&
        typeof f.key === "string" &&
        typeof f.label === "string" &&
        VALID_FIELD_TYPES.has(f.type as string) &&
        f.defaultValue !== undefined
    );
    // Ensure there's always a label field
    if (!fields.some((f) => f.key === "label")) {
      fields.unshift({
        key: "label",
        label: "Label",
        type: "text",
        defaultValue: raw.label as string,
      });
    }
  }

  return createUserNodeDefinition({
    label: raw.label as string,
    description: typeof raw.description === "string" ? raw.description : "",
    emoji: typeof raw.emoji === "string" ? raw.emoji : "🔧",
    color: typeof raw.color === "string" ? raw.color : "#818cf8",
    fields,
    inputs: typeof raw.inputs === "number" ? Math.max(0, Math.min(raw.inputs, 8)) : 1,
    outputs: typeof raw.outputs === "number" ? Math.max(0, Math.min(raw.outputs, 8)) : 1,
  });
}

// ── Tabs ─────────────────────────────────────────────────────────

type ChatTab = "chat" | "nodes";

// ── Component ────────────────────────────────────────────────────

export function BuilderChat({
  currentNodes,
  currentEdges,
  category,
  onApplyFlow,
  onUserNodeCreated,
  onChat,
  apiKey: propApiKey,
  storageKeyPrefix = "athena",
}: BuilderChatProps) {
  const [activeTab, setActiveTab] = React.useState<ChatTab>("chat");
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I'm your Builder Assistant. I can help you:\n\n" +
        "**Build flows:**\n" +
        '- "Create a team of 3 focused on growth"\n' +
        '- "Build a pipeline with Claude and conditions"\n\n' +
        "**Create custom nodes:**\n" +
        '- "Create a Slack notification node"\n' +
        '- "Make a database query node with connection string and query fields"\n\n' +
        "**Manage templates:**\n" +
        '- "Save this as a template called My Flow"\n\n' +
        "What would you like to build?",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [userNodeDefs, setUserNodeDefs] = React.useState<UserNodeDefinition[]>([]);
  const [confirmDeleteNodeId, setConfirmDeleteNodeId] = React.useState<string | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Load user nodes on mount
  React.useEffect(() => {
    setUserNodeDefs(getUserNodes());
  }, []);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: uid("msg"),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      if (!onChat) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid("msg"),
            role: "assistant",
            content: "AI chat is not configured. Provide an onChat handler to enable this feature.",
          },
        ]);
        setLoading(false);
        return;
      }

      const apiKey =
        propApiKey ??
        (typeof window !== "undefined"
          ? localStorage.getItem(`${storageKeyPrefix}_anthropic_key`) ?? ""
          : "");

      const canvasSummary = buildCanvasSummary(currentNodes, currentEdges, true);

      const data = await onChat({
        apiKey,
        message: userMsg.content,
        currentNodes,
        currentEdges,
        canvasSummary,
        category: category as string,
        history: messages.slice(-8).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid("msg"),
            role: "assistant",
            content: `Error: ${data.error}`,
          },
        ]);
      } else {
        // Create user node from structured API response (server-side parsed)
        const userNodeDef = createUserNodeFromResponse(
          data.userNodeDef as Record<string, unknown> | undefined
        );

        if (userNodeDef) {
          saveUserNode(userNodeDef);
          setUserNodeDefs(getUserNodes());
          onUserNodeCreated?.();
        }

        const assistantMsg: Message = {
          id: uid("msg"),
          role: "assistant",
          content: data.message || (userNodeDef ? `Created custom node "${userNodeDef.label}"!` : "Here's your updated flow:"),
          flowUpdate: data.flowUpdate,
          userNodeCreated: userNodeDef ?? undefined,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // If user asked to save as template
        if (data.saveAsTemplate) {
          const template: FlowTemplate = {
            id: uid("tpl"),
            name: data.saveAsTemplate.name,
            description: data.saveAsTemplate.description,
            category: "custom",
            nodes: data.flowUpdate?.nodes ?? currentNodes,
            edges: data.flowUpdate?.edges ?? currentEdges,
            createdAt: new Date().toISOString().split("T")[0],
            isBuiltIn: false,
          };
          saveCustomTemplate(template);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to connect.";
      // Filter out any potential API key leaks from error messages
      const safeMsg = sanitizeErrorMessage(errorMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: uid("msg"),
          role: "assistant",
          content: `Error: ${safeMsg}. Make sure your Anthropic API key is set in Settings.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleApplyFlow(nodes: Node[], edges: Edge[]) {
    onApplyFlow(nodes, edges);
  }

  function handleDeleteUserNode(id: string) {
    if (confirmDeleteNodeId !== id) {
      setConfirmDeleteNodeId(id);
      return;
    }
    deleteUserNode(id);
    setUserNodeDefs(getUserNodes());
    setConfirmDeleteNodeId(null);
    onUserNodeCreated?.();
  }

  return (
    <div className="flex h-full flex-col bg-background border-l border-white/10">
      {/* Tab bar */}
      <div className="flex items-center border-b border-white/10 px-1">
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition ${
            activeTab === "chat"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat
          </span>
        </button>
        <button
          onClick={() => setActiveTab("nodes")}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition ${
            activeTab === "nodes"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
            My Nodes
            {userNodeDefs.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-[10px] text-primary">
                {userNodeDefs.length}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* ── Chat Tab ──────────────────────────────────────────── */}
      {activeTab === "chat" && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary/15 text-foreground"
                      : "bg-white/5 text-foreground border border-white/10"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Apply flow button */}
                  {msg.flowUpdate && (
                    <button
                      onClick={() =>
                        handleApplyFlow(msg.flowUpdate!.nodes, msg.flowUpdate!.edges)
                      }
                      className="mt-2 w-full rounded-lg bg-primary/20 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/30 transition"
                    >
                      Apply to Canvas ({msg.flowUpdate.nodes.length} nodes,{" "}
                      {msg.flowUpdate.edges.length} edges)
                    </button>
                  )}

                  {/* User node created badge */}
                  {msg.userNodeCreated && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5">
                      <span>{msg.userNodeCreated.emoji}</span>
                      <span className="text-[11px] font-medium text-emerald-400">
                        Node "{msg.userNodeCreated.label}" saved to My Nodes
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-muted-foreground">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions */}
          <div className="px-3 pb-1 flex flex-wrap gap-1">
            {[
              { label: "New node", prompt: "Create a custom node for " },
              { label: "Template", prompt: "Save this as a template called " },
              { label: "Connect all", prompt: "Connect all nodes in logical order" },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => setInput(action.prompt)}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
              >
                {action.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Build a flow, create a node..."
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                disabled={loading}
              />
              <Button size="sm" type="submit" disabled={loading || !input.trim()}>
                Send
              </Button>
            </form>
          </div>
        </>
      )}

      {/* ── My Nodes Tab ──────────────────────────────────────── */}
      {activeTab === "nodes" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {userNodeDefs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="text-3xl mb-3">🔧</div>
              <h3 className="text-sm font-semibold text-foreground mb-1">No custom nodes yet</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Ask the chat assistant to create custom nodes for your workflows. They'll appear here and in the node palette.
              </p>
              <button
                onClick={() => {
                  setActiveTab("chat");
                  setInput("Create a custom node for ");
                }}
                className="rounded-lg bg-primary/15 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/25 transition"
              >
                Create your first node
              </button>
            </div>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1">
                Your Custom Nodes ({userNodeDefs.length})
              </div>
              {userNodeDefs.map((def) => (
                <div
                  key={def.id}
                  className="group rounded-xl border border-white/10 bg-white/[0.02] p-3 hover:bg-white/5 transition"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{def.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {def.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {def.description || "No description"}
                      </div>
                    </div>
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: def.color }}
                    />
                  </div>

                  {/* Fields */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {def.fields.map((f) => (
                      <span
                        key={f.key}
                        className="rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                      >
                        {f.label} ({f.type})
                      </span>
                    ))}
                  </div>

                  {/* IO */}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/60">
                    <span>{def.inputs} input{def.inputs !== 1 ? "s" : ""}</span>
                    <span>{def.outputs} output{def.outputs !== 1 ? "s" : ""}</span>
                    <span className="ml-auto text-muted-foreground/40">
                      {new Date(def.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setActiveTab("chat");
                        setInput(`Update the "${def.label}" node to `);
                      }}
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
                    >
                      Edit via chat
                    </button>
                    <button
                      onClick={() => handleDeleteUserNode(def.id)}
                      className={`rounded-md px-2 py-1 text-[10px] transition ${
                        confirmDeleteNodeId === def.id
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "border border-white/10 bg-white/5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      }`}
                    >
                      {confirmDeleteNodeId === def.id ? "Confirm?" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={() => {
                  setActiveTab("chat");
                  setInput("Create a custom node for ");
                }}
                className="w-full rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-3 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/50 transition"
              >
                + Create New Node
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
