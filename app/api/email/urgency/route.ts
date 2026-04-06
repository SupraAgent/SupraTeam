/**
 * GET /api/email/urgency — AI-scored email threads needing attention.
 * Returns threads ranked by urgency with AI recommendation summaries.
 * Used by the dashboard Email Urgency widget.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { sanitizeEmailError } from "@/lib/email/errors";
import { serverCache, TTL } from "@/lib/email/server-cache";
import { getAnthropicKey } from "@/lib/ai-key";

interface UrgentThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  received_at: string;
  urgency: "critical" | "high" | "medium" | "low";
  urgency_score: number;
  reason: string;
  deal_name: string | null;
  deal_id: string | null;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || "10"), 20);
  const connectionId = searchParams.get("connectionId") ?? undefined;

  // Cache for 2 minutes to avoid hammering Gmail + AI
  const cacheKey = `email-urgency:${auth.user.id}:${connectionId ?? "default"}`;
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ threads: cached, source: "cache" });
  }

  try {
    const { driver } = await getDriverForUser(auth.user.id, connectionId);

    // Fetch recent unread threads from inbox
    const result = await driver.listThreads({
      labelIds: ["INBOX", "UNREAD"],
      maxResults: 30,
    });

    const threads = result.threads ?? [];
    if (threads.length === 0) {
      serverCache.set(cacheKey, [], TTL.THREAD_LIST);
      return NextResponse.json({ threads: [], source: "gmail" });
    }

    // Fetch deal links for these threads
    const threadIds = threads.map((t: { id: string }) => t.id);
    const { data: dealLinks } = await supabase
      .from("crm_deal_email_threads")
      .select("thread_id, deal:crm_deals(id, deal_name)")
      .in("thread_id", threadIds);

    const dealMap = new Map<string, { id: string; deal_name: string }>();
    for (const l of dealLinks ?? []) {
      const deal = Array.isArray(l.deal) ? l.deal[0] : l.deal;
      if (deal && l.thread_id) dealMap.set(l.thread_id, deal);
    }

    // Score threads with heuristics first (fast path)
    const scored: UrgentThread[] = threads
      .map((t: { id: string; subject?: string; snippet?: string; messages?: { from?: { name?: string; email?: string }; date?: string }[] }) => {
        const lastMsg = t.messages?.[t.messages.length - 1];
        const from = lastMsg?.from?.name || lastMsg?.from?.email || "Unknown";
        const subject = t.subject || "(no subject)";
        const snippet = t.snippet || "";
        const receivedAt = lastMsg?.date || new Date().toISOString();
        const deal = dealMap.get(t.id);

        // Heuristic scoring
        let score = 50;
        const hoursOld = (Date.now() - new Date(receivedAt).getTime()) / 3600000;

        // Time urgency: older unread = more urgent
        if (hoursOld > 48) score += 25;
        else if (hoursOld > 24) score += 20;
        else if (hoursOld > 8) score += 10;
        else if (hoursOld > 4) score += 5;

        // Deal-linked threads are more important
        if (deal) score += 15;

        // Keyword signals
        const lower = `${subject} ${snippet}`.toLowerCase();
        if (lower.includes("urgent") || lower.includes("asap")) score += 20;
        if (lower.includes("deadline") || lower.includes("by eod") || lower.includes("by end of day")) score += 15;
        if (lower.includes("proposal") || lower.includes("contract") || lower.includes("agreement")) score += 10;
        if (lower.includes("follow up") || lower.includes("following up") || lower.includes("checking in")) score += 8;
        if (lower.includes("meeting") || lower.includes("call") || lower.includes("schedule")) score += 5;
        if (lower.includes("no-reply") || lower.includes("noreply") || lower.includes("newsletter")) score -= 30;
        if (lower.includes("unsubscribe")) score -= 25;

        const urgency: UrgentThread["urgency"] =
          score >= 80 ? "critical" : score >= 65 ? "high" : score >= 45 ? "medium" : "low";

        // Build reason
        const reasons: string[] = [];
        if (hoursOld > 24) reasons.push(`Waiting ${Math.round(hoursOld)}h`);
        if (deal) reasons.push(`Linked to ${deal.deal_name}`);
        if (lower.includes("urgent") || lower.includes("asap")) reasons.push("Marked urgent");
        if (lower.includes("proposal") || lower.includes("contract")) reasons.push("Contains proposal/contract");
        if (reasons.length === 0) reasons.push("Unread in inbox");

        return {
          id: t.id,
          subject,
          from,
          snippet: snippet.slice(0, 120),
          received_at: receivedAt,
          urgency,
          urgency_score: Math.min(score, 100),
          reason: reasons.join(" · "),
          deal_name: deal?.deal_name ?? null,
          deal_id: deal?.id ?? null,
        };
      })
      .sort((a: UrgentThread, b: UrgentThread) => b.urgency_score - a.urgency_score)
      .slice(0, limit);

    // Optional: AI enhancement for top threads
    const apiKey = await getAnthropicKey(auth.user.id);
    if (apiKey && scored.length > 0) {
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey });

        const threadSummaries = scored.slice(0, 5).map((t, i) =>
          `${i + 1}. Subject: "${t.subject}" | From: ${t.from} | Snippet: "${t.snippet}" | Hours waiting: ${Math.round((Date.now() - new Date(t.received_at).getTime()) / 3600000)} | Deal: ${t.deal_name || "none"}`
        ).join("\n");

        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `You are a BD assistant. For each email thread below, write a 5-8 word action recommendation. Reply as JSON array of strings, one per thread. No explanation.

<threads>
${threadSummaries}
</threads>`,
          }],
        });

        const text = response.content[0].type === "text" ? response.content[0].text : "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const recommendations: string[] = JSON.parse(jsonMatch[0]);
          for (let i = 0; i < Math.min(recommendations.length, scored.length); i++) {
            scored[i].reason = recommendations[i] || scored[i].reason;
          }
        }
      } catch {
        // AI enhancement failed — use heuristic reasons (already set)
      }
    }

    serverCache.set(cacheKey, scored, TTL.THREAD_LIST);
    return NextResponse.json({ threads: scored, source: "gmail" });
  } catch (err: unknown) {
    const { message, status, reconnect } = sanitizeEmailError(err, "Failed to fetch email urgency");
    return NextResponse.json({ error: message, reconnect }, { status });
  }
}
