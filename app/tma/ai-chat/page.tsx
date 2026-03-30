"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Send, Loader2, Sparkles, Bot, User } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { useTelegramWebApp } from "@/components/tma/use-telegram";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "What deals need my attention?",
  "Help me draft an outreach message",
  "Summarize my pipeline health",
  "What tasks are overdue?",
];

export default function TMAAIChatPage() {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useTelegramWebApp();

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          page_context: "/tma",
        }),
      });

      if (!res.ok) {
        setMessages([...newMessages, { role: "assistant", content: "Sorry, something went wrong." }]);
        return;
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      if (!reader) {
        setMessages([...newMessages, { role: "assistant", content: "No response received." }]);
        return;
      }

      let assistantContent = "";
      const decoder = new TextDecoder();
      setMessages([...newMessages, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantContent += parsed.text;
                setMessages([...newMessages, { role: "assistant", content: assistantContent }]);
              }
            } catch {
              // Some responses are plain text
              assistantContent += data;
              setMessages([...newMessages, { role: "assistant", content: assistantContent }]);
            }
          }
        }
      }

      // Ensure final message is set
      if (assistantContent) {
        setMessages([...newMessages, { role: "assistant", content: assistantContent }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Failed to connect. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-dvh">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">AI Assistant</h1>
            <p className="text-[10px] text-muted-foreground">SupraTeam powered by Claude</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-36">
        {messages.length === 0 && (
          <div className="py-8 space-y-4">
            <div className="text-center">
              <Sparkles className="mx-auto h-8 w-8 text-primary/30" />
              <p className="mt-2 text-sm text-foreground">How can I help?</p>
              <p className="text-[10px] text-muted-foreground">Ask me anything about your CRM</p>
            </div>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-foreground/80 transition active:bg-white/[0.06]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3 w-3 text-primary" />
              </div>
            )}
            <div className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-white/[0.05] text-foreground rounded-bl-md"
            )}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="rounded-2xl rounded-bl-md bg-white/[0.05] px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="fixed bottom-16 left-0 right-0 px-4 py-3 border-t border-white/5 bg-[hsl(225,35%,5%)] safe-area-bottom">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask anything..."
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm outline-none focus:border-primary/30"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className={cn(
              "shrink-0 rounded-xl px-3 transition-colors",
              input.trim() ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground/30"
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <BottomTabBar active="more" />
    </div>
  );
}
