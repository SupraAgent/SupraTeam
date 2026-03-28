"use client";

import { WorkflowBuilder } from "@supra/loop-builder";
import type {
  FlowChatRequest,
  FlowChatResponse,
  LLMExecuteRequest,
  LLMExecuteResponse,
} from "@supra/loop-builder";

async function handleChat(
  req: FlowChatRequest
): Promise<FlowChatResponse> {
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
      const err = await res.json();
      return { content: "", error: err.error || "Request failed" };
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return { content: "", error: "Streaming not supported" };
    }

    const decoder = new TextDecoder();
    let finalContent = "";
    let usage:
      | { input_tokens?: number; output_tokens?: number }
      | undefined;

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
                // Skip malformed events
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

export default function LoopBuilderPage() {
  return (
    <WorkflowBuilder
      category="workflow"
      storageKeyPrefix="suprateam_loop"
      onChat={handleChat}
      onLLMExecute={handleLLMExecute}
      title="Loop Builder"
      subtitle="Drag-and-drop automation workflows for SupraCRM"
      showAIChat
      className="h-full"
    />
  );
}
