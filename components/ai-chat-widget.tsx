"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface WorkflowData {
  nodes: unknown[];
  edges: unknown[];
  action: "add" | "replace";
}

// Global event for applying workflow nodes to the canvas
export function dispatchApplyWorkflow(data: WorkflowData) {
  window.dispatchEvent(
    new CustomEvent("supracrm:apply-workflow", { detail: data })
  );
}

const SUGGESTIONS: Record<string, string[]> = {
  "/automations": [
    "When a deal reaches MOU Signed, send a congrats message",
    "Create a follow-up task when a deal enters Video Call stage",
    "Send a daily digest of new deals to the BD group",
  ],
  default: [
    "How do I create a new automation?",
    "What pipeline stages are available?",
    "How do slugs and access control work?",
  ],
};

export function AIChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [lastWorkflow, setLastWorkflow] = React.useState<WorkflowData | null>(null);
  const [applied, setApplied] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const isWorkflowEditor = pathname?.match(/^\/automations\/[^/]+$/);

  // Auto-scroll to bottom
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const suggestions = isWorkflowEditor
    ? SUGGESTIONS["/automations"]
    : SUGGESTIONS.default;

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setLastWorkflow(null);
    setApplied(false);

    try {
      const context: Record<string, unknown> = { page: pathname };

      // If on workflow editor, get current canvas state
      if (isWorkflowEditor) {
        const workflowId = pathname?.split("/").pop();
        context.workflowId = workflowId;

        // Try to get canvas state from the global event
        const canvasState = (window as unknown as Record<string, unknown>).__supracrm_canvas_state as
          | { nodes: unknown[]; edges: unknown[] }
          | undefined;
        if (canvasState) {
          context.workflowNodes = canvasState.nodes;
          context.workflowEdges = canvasState.edges;
        }
      }

      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, context }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      const { data } = await res.json();
      const assistantMsg: Message = { role: "assistant", content: data.reply };
      setMessages([...newMessages, assistantMsg]);

      if (data.workflow?.nodes?.length) {
        setLastWorkflow(data.workflow);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages([...newMessages, { role: "assistant", content: `Error: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!lastWorkflow) return;
    dispatchApplyWorkflow(lastWorkflow);
    setApplied(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleClear() {
    setMessages([]);
    setLastWorkflow(null);
    setApplied(false);
  }

  // Don't show on login page
  if (pathname === "/login") return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/20 text-primary-foreground transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/30 active:scale-95"
          title="AI Assistant"
        >
          <SparklesIcon className="h-5 w-5" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col w-[380px] h-[520px] rounded-2xl border border-white/10 bg-[hsl(225,35%,6%)] shadow-2xl shadow-black/40 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20">
                <SparklesIcon className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">SupraCRM AI</div>
                <div className="text-[10px] text-muted-foreground">
                  {isWorkflowEditor ? "Automation builder mode" : "Ask me anything"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={handleClear}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition"
                  title="Clear chat"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition"
              >
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 thin-scroll">
            {messages.length === 0 && (
              <div className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground text-center">
                  {isWorkflowEditor
                    ? "Describe an automation and I'll build it for you."
                    : "How can I help you today?"}
                </p>
                <div className="space-y-2">
                  {suggestions?.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="w-full text-left px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.02] text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] hover:border-white/10 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary/20 text-foreground rounded-br-md"
                      : "bg-white/[0.04] text-foreground/90 rounded-bl-md border border-white/[0.06]"
                  )}
                >
                  <MessageContent content={msg.content} />
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.04] rounded-2xl rounded-bl-md px-3 py-2 border border-white/[0.06]">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            {/* Apply workflow button */}
            {lastWorkflow && isWorkflowEditor && (
              <div className="flex justify-start">
                <button
                  onClick={handleApply}
                  disabled={applied}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition",
                    applied
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default"
                      : "bg-primary/20 text-primary border border-primary/20 hover:bg-primary/30"
                  )}
                >
                  {applied ? (
                    <>
                      <CheckIcon className="h-3 w-3" />
                      Applied {lastWorkflow.nodes.length} nodes
                    </>
                  ) : (
                    <>
                      <PlusIcon className="h-3 w-3" />
                      Apply to canvas ({lastWorkflow.nodes.length} nodes, {lastWorkflow.edges.length} edges)
                    </>
                  )}
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isWorkflowEditor ? "Describe your automation..." : "Ask anything..."}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition max-h-24"
                style={{ minHeight: 36 }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "36px";
                  t.style.height = Math.min(t.scrollHeight, 96) + "px";
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Simple markdown-ish rendering for AI responses */
function MessageContent({ content }: { content: string }) {
  // Split by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const code = part.replace(/```\w*\n?/, "").replace(/\n?```$/, "");
          return (
            <pre key={i} className="mt-2 mb-1 rounded-lg bg-black/30 p-2 text-[11px] overflow-x-auto font-mono text-muted-foreground">
              {code}
            </pre>
          );
        }
        // Basic inline formatting
        return (
          <span key={i} className="whitespace-pre-wrap">
            {part.split(/(\*\*.*?\*\*)/g).map((seg, j) =>
              seg.startsWith("**") && seg.endsWith("**") ? (
                <strong key={j} className="font-semibold text-foreground">
                  {seg.slice(2, -2)}
                </strong>
              ) : (
                seg
              )
            )}
          </span>
        );
      })}
    </>
  );
}

// Inline icons to avoid extra imports

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}
