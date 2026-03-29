"use client";

import * as React from "react";
import {
  WorkflowBuilder,
  configureBuilder,
} from "@supra/loop-builder";
import type {
  FlowChatRequest,
  FlowChatResponse,
  LLMExecuteRequest,
  LLMExecuteResponse,
} from "@supra/loop-builder";
import { CRM_NODE_TYPES } from "./_lib/crm-node-types";
import { CRM_PALETTE_ITEMS } from "./_lib/crm-palette-items";
import { CRM_NODE_EDITORS } from "./_lib/crm-node-editors";

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
    const result: LLMExecuteResponse = { content: "", stream: undefined, usage: undefined };

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
                  result.content += event.text;
                  controller.enqueue(event.text);
                } else if (event.type === "done") {
                  result.usage = event.usage;
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
    result.stream = textStream;
    return result;
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
      storagePrefix: "suprateam",
      idbName: "suprateam-automations",
      logPrefix: "@suprateam/automations",
      commitMessagePrefix: "Workflow",
    });
  }, []);

  return (
    <WorkflowBuilder
      category="workflow"
      storageKeyPrefix="suprateam"
      customNodeTypes={CRM_NODE_TYPES as Record<string, React.ComponentType<unknown>>}
      customPaletteItems={CRM_PALETTE_ITEMS}
      customNodeEditors={CRM_NODE_EDITORS}
      onChat={handleChat}
      onLLMExecute={handleLLMExecute}
      title="Automations"
      subtitle="Build CRM automation workflows with drag & drop"
      showAIChat
      className="h-full"
    />
  );
}
