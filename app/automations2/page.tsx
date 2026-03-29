"use client";

import * as React from "react";
import {
  WorkflowBuilder,
  configureBuilder,
  setBuiltInTemplates,
  DOMAIN_BUILT_IN_TEMPLATES,
  domainNodeTypes,
  DOMAIN_PALETTE_ITEMS,
  domainInspectorEditors,
} from "@supra/loop-builder";
import type {
  FlowChatRequest,
  FlowChatResponse,
  LLMExecuteRequest,
  LLMExecuteResponse,
} from "@supra/loop-builder";

// ── AI Handlers (reuse existing /api/loop endpoints) ────────────

async function handleChat(req: FlowChatRequest): Promise<FlowChatResponse> {
  const res = await fetch("/api/loop/flow-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    return { message: "", error: err.error || "Request failed" };
  }
  return res.json();
}

async function handleLLMExecute(
  req: LLMExecuteRequest
): Promise<LLMExecuteResponse> {
  if (req.stream) {
    const res = await fetch("/api/loop/flow-execute-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      return { content: "", error: err.error || "Request failed" };
    }
    const reader = res.body?.getReader();
    if (!reader) return { content: "", error: "Streaming not supported" };

    const decoder = new TextDecoder();
    let finalContent = "";
    let usage: { input_tokens?: number; output_tokens?: number } | undefined;

    const textStream = new ReadableStream<string>({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const dataLine = line.replace(/^data: /, "").trim();
              if (!dataLine) continue;
              try {
                const event = JSON.parse(dataLine);
                if (event.type === "text") {
                  finalContent += event.text;
                  controller.enqueue(event.text);
                } else if (event.type === "done") {
                  usage = event.usage;
                } else if (event.type === "error") {
                  controller.error(new Error(event.error));
                  return;
                }
              } catch {
                /* skip malformed */
              }
            }
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });
    return { content: finalContent, stream: textStream, usage };
  }

  const res = await fetch("/api/loop/flow-execute-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    return { content: "", error: err.error || "Request failed" };
  }
  return res.json();
}

// ── Page ────────────────────────────────────────────────────────

export default function Automations2Page() {
  React.useEffect(() => {
    configureBuilder({
      storagePrefix: "supraloop",
      idbName: "supraloop-storage",
      logPrefix: "@supra/builder",
      commitMessagePrefix: "SupraLoop",
    });
    setBuiltInTemplates(DOMAIN_BUILT_IN_TEMPLATES);
  }, []);

  return (
    <WorkflowBuilder
      category="workflow"
      storageKeyPrefix="supraloop"
      customNodeTypes={domainNodeTypes}
      customPaletteItems={DOMAIN_PALETTE_ITEMS}
      customNodeEditors={domainInspectorEditors}
      onChat={handleChat}
      onLLMExecute={handleLLMExecute}
      title="SupraLoop Builder"
      subtitle="Build, connect, and orchestrate automation workflows"
      showAIChat
      className="h-full"
    />
  );
}
