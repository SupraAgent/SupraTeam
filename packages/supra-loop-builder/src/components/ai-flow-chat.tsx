"use client";

import * as React from "react";
import { Button } from "../ui/button";
import type { Node, Edge } from "@xyflow/react";
import type { FlowTemplate } from "../lib/flow-templates";
import { saveCustomTemplate } from "../lib/flow-templates";
import type { FlowChatHandler } from "../types";
import { buildCanvasSummary } from "../lib/canvas-summary";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  flowUpdate?: { nodes: Node[]; edges: Edge[] };
};

type AIFlowChatProps = {
  currentNodes: Node[];
  currentEdges: Edge[];
  category: FlowTemplate["category"];
  onApplyFlow: (nodes: Node[], edges: Edge[]) => void;
  /** Handler for chat requests */
  onChat?: FlowChatHandler;
  /** API key (if not provided, reads from localStorage) */
  apiKey?: string;
  /** Storage key prefix for reading API key from localStorage */
  storageKeyPrefix?: string;
};

export function AIFlowChat({
  currentNodes,
  currentEdges,
  category,
  onApplyFlow,
  onChat,
  apiKey: propApiKey,
  storageKeyPrefix = "athena",
}: AIFlowChatProps) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I can help you build and modify workflow chains. Try:\n\n" +
        '- "Create a team of 3 focused on growth"\n' +
        '- "Build a pipeline with Claude and conditions"\n' +
        '- "Add an LLM node connected to Claude Code"\n' +
        '- "Create a persona builder workflow"\n' +
        '- "Save this as a template called My Flow"\n\n' +
        "Connect your own Claude API key or Claude Code for LLM nodes.",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const msgIdRef = React.useRef(0);
  const nextId = (prefix: string) => `${prefix}-${++msgIdRef.current}`;
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: nextId("user"),
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
            id: nextId("err"),
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

      const data = await onChat({
        apiKey,
        message: userMsg.content,
        currentNodes,
        currentEdges,
        canvasSummary: buildCanvasSummary(currentNodes, currentEdges),
        category: category as string,
        history: messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId("err"),
            role: "assistant",
            content: `Error: ${data.error}`,
          },
        ]);
      } else {
        const assistantMsg: Message = {
          id: nextId("assistant"),
          role: "assistant",
          content: data.message,
          flowUpdate: data.flowUpdate,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // If user asked to save as template
        if (data.saveAsTemplate) {
          const template: FlowTemplate = {
            id: `ai-${nextId("tpl")}`,
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
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId("err"),
          role: "assistant",
          content: "Failed to connect. Make sure your Anthropic API key is set in Settings.",
        },
      ]);
    }

    setLoading(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110 transition active:scale-95 bottom-16 right-4 md:bottom-6 md:right-6"
        title="AI Flow Assistant"
      >
        <span className="text-xl">🤖</span>
      </button>
    );
  }

  return (
    <div role="dialog" aria-label="Flow Assistant" className="fixed inset-0 rounded-none md:inset-auto md:bottom-6 md:right-6 z-50 flex md:h-[500px] md:w-[380px] flex-col md:rounded-2xl border-0 md:border border-white/10 bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Mobile back button */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="md:hidden rounded-lg p-1 text-muted-foreground hover:text-foreground transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <span className="text-lg">🤖</span>
          <div>
            <div className="text-sm font-semibold text-foreground">Flow Assistant</div>
            <div className="text-[10px] text-muted-foreground">Build templates with AI</div>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="hidden md:block text-muted-foreground hover:text-foreground transition"
          aria-label="Close chat"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary/15 text-foreground"
                  : "bg-white/5 text-foreground border border-white/10"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.flowUpdate && (
                <button
                  onClick={() =>
                    onApplyFlow(msg.flowUpdate!.nodes, msg.flowUpdate!.edges)
                  }
                  className="mt-2 w-full rounded-lg bg-primary/20 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/30 transition"
                >
                  Apply to Canvas ({msg.flowUpdate.nodes.length} nodes,{" "}
                  {msg.flowUpdate.edges.length} edges)
                </button>
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
            placeholder="Describe what to build..."
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            disabled={loading}
          />
          <Button size="sm" type="submit" disabled={loading || !input.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
