import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { logEmailAction } from "@/lib/email/audit";

/**
 * POST: AI email features
 * Actions: draft, compose, summarize, search, adjust-tone
 *
 * Requires ANTHROPIC_API_KEY env var.
 * Uses Anthropic API directly (no Vercel AI SDK dependency needed for v1).
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }

  let body: {
    action: "draft" | "compose" | "summarize" | "search" | "adjust-tone" | "categorize";
    threadId?: string;
    prompt?: string;
    tone?: string;
    text?: string;
    messages?: { role: string; content: string }[];
    threads?: { id: string; subject: string; snippet: string; from: string }[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "draft": {
        // Auto-draft reply based on thread content
        if (!body.threadId) {
          return NextResponse.json({ error: "threadId required for draft" }, { status: 400 });
        }
        const { driver } = await getDriverForUser(auth.user.id);
        const thread = await driver.getThread(body.threadId);
        const threadContext = thread.messages
          .map((m) => `From: ${m.from.name || m.from.email}\n${m.bodyText}`)
          .join("\n---\n");

        const draft = await callClaude(apiKey, [
          {
            role: "user",
            content: `You are drafting an email reply. Here is the email thread:\n\n${threadContext}\n\nDraft a professional, concise reply. Only output the email body text, no subject line or headers.${body.prompt ? `\n\nAdditional instructions: ${body.prompt}` : ""}`,
          },
        ]);

        logEmailAction(auth.admin, {
          userId: auth.user.id,
          action: `ai_${body.action}`,
          threadId: body.threadId,
          metadata: { action: body.action },
        });

        return NextResponse.json({ data: { draft }, source: "ai" });
      }

      case "compose": {
        if (!body.prompt) {
          return NextResponse.json({ error: "prompt required for compose" }, { status: 400 });
        }
        const composed = await callClaude(apiKey, [
          {
            role: "user",
            content: `Write a professional email based on this request: "${body.prompt}"\n\nOutput format:\nSUBJECT: <subject line>\nBODY:\n<email body>`,
          },
        ]);

        // Parse subject and body
        const subjectMatch = composed.match(/SUBJECT:\s*(.+)/);
        const bodyMatch = composed.match(/BODY:\s*([\s\S]+)/);

        logEmailAction(auth.admin, {
          userId: auth.user.id,
          action: `ai_${body.action}`,
          threadId: body.threadId,
          metadata: { action: body.action },
        });

        return NextResponse.json({
          data: {
            subject: subjectMatch?.[1]?.trim() ?? "",
            body: bodyMatch?.[1]?.trim() ?? composed,
          },
          source: "ai",
        });
      }

      case "summarize": {
        if (!body.threadId) {
          return NextResponse.json({ error: "threadId required for summarize" }, { status: 400 });
        }
        const { driver } = await getDriverForUser(auth.user.id);
        const thread = await driver.getThread(body.threadId);
        const threadText = thread.messages
          .map((m) => `From: ${m.from.name || m.from.email} (${m.date})\n${m.bodyText}`)
          .join("\n---\n");

        const summary = await callClaude(apiKey, [
          {
            role: "user",
            content: `Summarize this email thread in 2-3 bullet points. Be concise:\n\n${threadText}`,
          },
        ]);

        logEmailAction(auth.admin, {
          userId: auth.user.id,
          action: `ai_${body.action}`,
          threadId: body.threadId,
          metadata: { action: body.action },
        });

        return NextResponse.json({ data: { summary }, source: "ai" });
      }

      case "search": {
        if (!body.prompt) {
          return NextResponse.json({ error: "prompt required for search" }, { status: 400 });
        }
        const searchQuery = await callClaude(apiKey, [
          {
            role: "user",
            content: `Convert this natural language email search into a Gmail search query. Only output the search query, nothing else.\n\nSearch: "${body.prompt}"\n\nGmail search operators: from:, to:, subject:, has:attachment, after:YYYY/MM/DD, before:YYYY/MM/DD, is:unread, is:starred, label:, in:inbox/sent/trash`,
          },
        ]);

        logEmailAction(auth.admin, {
          userId: auth.user.id,
          action: `ai_${body.action}`,
          threadId: body.threadId,
          metadata: { action: body.action },
        });

        return NextResponse.json({ data: { query: searchQuery.trim() }, source: "ai" });
      }

      case "categorize": {
        if (!body.threads?.length) {
          return NextResponse.json({ error: "threads required for categorize" }, { status: 400 });
        }

        const threadSummary = body.threads
          .map((t, i) => `${i + 1}. ID: ${t.id}\n   From: ${t.from}\n   Subject: ${t.subject}\n   Preview: ${t.snippet}`)
          .join("\n\n");

        const result = await callClaude(apiKey, [{
          role: "user",
          content: `Categorize each email thread into exactly one category. Categories:
- vip: From executives, investors, key partners, or about active deals
- action_required: Needs a reply or action from the reader
- fyi: Informational updates, CC'd threads, status reports
- newsletter: Marketing emails, newsletters, promotional content
- other: Everything else

Respond with ONLY a JSON object mapping thread ID to category. Example:
{"abc123": "vip", "def456": "newsletter"}

Threads to categorize:

${threadSummary}`
        }]);

        // Parse the JSON response
        try {
          const cleaned = result.replace(/```json\n?|\n?```/g, "").trim();
          const categories = JSON.parse(cleaned);
          return NextResponse.json({ data: { categories }, source: "ai" });
        } catch {
          return NextResponse.json({ data: { categories: {} }, source: "ai" });
        }
      }

      case "adjust-tone": {
        if (!body.text || !body.tone) {
          return NextResponse.json({ error: "text and tone required" }, { status: 400 });
        }
        const adjusted = await callClaude(apiKey, [
          {
            role: "user",
            content: `Rewrite this email in a ${body.tone} tone. Only output the rewritten text:\n\n${body.text}`,
          },
        ]);

        logEmailAction(auth.admin, {
          userId: auth.user.id,
          action: `ai_${body.action}`,
          threadId: body.threadId,
          metadata: { action: body.action },
        });

        return NextResponse.json({ data: { text: adjusted }, source: "ai" });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callClaude(
  apiKey: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}
