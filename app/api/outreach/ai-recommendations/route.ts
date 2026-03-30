/**
 * POST /api/outreach/ai-recommendations
 * AI-powered recommendations for outreach sequence improvements.
 * Analyzes sequence performance data and suggests changes to messaging,
 * timing, and targeting to improve reply rates.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getAnthropicKey } from "@/lib/ai-key";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const apiKey = await getAnthropicKey(user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured. Add your Anthropic key in Settings > Integrations." }, { status: 503 });
  }

  const body = await request.json();
  const { sequence_id } = body;

  if (!sequence_id) {
    return NextResponse.json({ error: "sequence_id is required" }, { status: 400 });
  }

  // Ownership check
  const { data: seq } = await supabase
    .from("crm_outreach_sequences")
    .select("created_by")
    .eq("id", sequence_id)
    .single();
  if (!seq) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  if (seq.created_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch sequence + steps + enrollments in parallel
  const [seqRes, stepsRes, enrollmentsRes] = await Promise.all([
    supabase.from("crm_outreach_sequences")
      .select("id, name, status, board_type, description")
      .eq("id", sequence_id)
      .single(),
    supabase.from("crm_outreach_steps")
      .select("id, step_number, step_type, step_label, delay_hours, message_template, variant_b_template, condition_type, split_percentage")
      .eq("sequence_id", sequence_id)
      .order("step_number"),
    supabase.from("crm_outreach_enrollments")
      .select("id, status, reply_count, ab_variant, enrolled_at, current_step")
      .eq("sequence_id", sequence_id),
  ]);

  const sequence = seqRes.data;
  const steps = stepsRes.data ?? [];
  const enrollments = enrollmentsRes.data ?? [];

  if (!sequence) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  // Fetch step logs for sent/failed counts
  const enrollmentIds = enrollments.map((e) => e.id);
  interface StepLog {
    step_id: string;
    status: string;
    ab_variant: string | null;
  }
  let stepLogs: StepLog[] = [];
  if (enrollmentIds.length > 0) {
    const { data } = await supabase
      .from("crm_outreach_step_log")
      .select("step_id, status, ab_variant")
      .in("enrollment_id", enrollmentIds);
    stepLogs = (data ?? []) as StepLog[];
  }

  // Build analytics context
  const total = enrollments.length;
  const replied = enrollments.filter((e) => e.reply_count > 0).length;
  const replyRate = total > 0 ? Math.round((replied / total) * 100) : 0;
  const completed = enrollments.filter((e) => e.status === "completed").length;
  const active = enrollments.filter((e) => e.status === "active").length;

  // Per-step stats
  const sentByStep = new Map<string, number>();
  const failedByStep = new Map<string, number>();
  for (const log of stepLogs) {
    if (log.status === "sent") sentByStep.set(log.step_id, (sentByStep.get(log.step_id) ?? 0) + 1);
    if (log.status === "failed") failedByStep.set(log.step_id, (failedByStep.get(log.step_id) ?? 0) + 1);
  }

  // A/B stats
  const variantA = enrollments.filter((e) => e.ab_variant === "A");
  const variantB = enrollments.filter((e) => e.ab_variant === "B");
  const aReplied = variantA.filter((e) => e.reply_count > 0).length;
  const bReplied = variantB.filter((e) => e.reply_count > 0).length;

  // Current step distribution (where are people stuck?)
  const stepDistribution: Record<number, number> = {};
  for (const e of enrollments.filter((e) => e.status === "active")) {
    stepDistribution[e.current_step] = (stepDistribution[e.current_step] ?? 0) + 1;
  }

  // Build prompt context
  let context = `Industry Benchmarks (Web3 Telegram Outreach):
- Average reply rate: 15-25% for warm leads, 5-10% for cold
- Best performing first messages: under 80 words, personalized, clear value prop
- Optimal follow-up timing: 24-48h for first follow-up, 72h+ for subsequent
- A/B test winners typically show 5-15% reply rate improvement
- Top performers use 3-5 step sequences, not more
- Messages with specific questions get 2x more replies than statements

`;
  context += `Outreach Sequence: "${sequence.name}"\n`;
  context += `Board: ${sequence.board_type ?? "Any"}\n`;
  context += `Status: ${sequence.status}\n`;
  if (sequence.description) context += `Description: ${sequence.description}\n`;
  context += `\nOverall Performance:\n`;
  context += `- ${total} total enrollments, ${active} active, ${completed} completed\n`;
  context += `- Reply rate: ${replyRate}% (${replied}/${total})\n`;

  if (variantA.length > 0 || variantB.length > 0) {
    context += `\nA/B Test:\n`;
    context += `- Variant A: ${variantA.length} enrolled, ${aReplied} replied (${variantA.length > 0 ? Math.round((aReplied / variantA.length) * 100) : 0}%)\n`;
    context += `- Variant B: ${variantB.length} enrolled, ${bReplied} replied (${variantB.length > 0 ? Math.round((bReplied / variantB.length) * 100) : 0}%)\n`;
  }

  context += `\nSteps:\n`;
  for (const step of steps) {
    const sent = sentByStep.get(step.id) ?? 0;
    const failed = failedByStep.get(step.id) ?? 0;
    const stuck = stepDistribution[step.step_number] ?? 0;

    context += `\nStep ${step.step_number} (${step.step_type}${step.step_label ? ` - ${step.step_label}` : ""}):\n`;
    context += `  Delay: ${step.delay_hours}h\n`;
    context += `  Sent: ${sent}, Failed: ${failed}${stuck > 0 ? `, Currently stuck here: ${stuck}` : ""}\n`;

    if (step.step_type === "message") {
      context += `  Template A: "${step.message_template}"\n`;
      if (step.variant_b_template) {
        context += `  Template B: "${step.variant_b_template}"\n`;
      }
    } else if (step.step_type === "condition") {
      context += `  Condition: ${step.condition_type}\n`;
    }
  }

  // Drop-off analysis
  const messageSteps = steps.filter((s) => s.step_type === "message");
  if (messageSteps.length >= 2) {
    context += `\nDrop-off Funnel:\n`;
    for (let i = 0; i < messageSteps.length; i++) {
      const sent = sentByStep.get(messageSteps[i].id) ?? 0;
      const prevSent = i > 0 ? (sentByStep.get(messageSteps[i - 1].id) ?? 0) : total;
      const dropoff = prevSent > 0 ? Math.round(((prevSent - sent) / prevSent) * 100) : 0;
      context += `- Step ${messageSteps[i].step_number}: ${sent} sent${i > 0 ? ` (-${dropoff}% from prev)` : ""}\n`;
    }
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are an expert outreach consultant for a Web3/blockchain company (Supra, an L1 blockchain). Analyze this Telegram outreach sequence and provide actionable recommendations.

Focus on:
1. MESSAGE IMPROVEMENTS: Specific rewording suggestions for underperforming steps. Be concrete — write the actual improved message.
2. TIMING: Are delays between steps optimal? Suggest specific changes.
3. A/B INSIGHTS: If there's A/B data, declare a winner and explain why. Suggest what to test next.
4. STRUCTURAL: Should steps be added, removed, or reordered? Should conditions be added?
5. QUICK WINS: One thing they can change right now for immediate improvement.

Format as JSON with this structure:
{
  "summary": "1-2 sentence overall assessment",
  "recommendations": [
    { "type": "message|timing|ab_test|structure|quick_win", "step": <step_number or null>, "title": "short title", "detail": "explanation", "suggested_change": "concrete suggestion or new message text" }
  ],
  "ab_winner": "A" | "B" | null,
  "ab_confidence": "high" | "medium" | "low" | null
}

Keep it under 5 recommendations. Be specific and actionable — no generic advice.

${context}`,
        }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "Unknown error");
      console.error(`[outreach/ai-recommendations] Anthropic API ${res.status}:`, errBody);
      return NextResponse.json({ error: `AI service error (${res.status})` }, { status: 502 });
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? "";

    // Parse JSON from response — use non-greedy match to avoid spanning multiple objects
    let recommendations;
    try {
      // Try direct parse first (ideal case: response is pure JSON)
      recommendations = JSON.parse(rawText);
    } catch {
      try {
        // Extract JSON from markdown code blocks or surrounding text
        const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : rawText;
        // Use greedy match to capture outermost braces (handles nested objects)
        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        const extracted = firstBrace >= 0 && lastBrace > firstBrace ? jsonStr.slice(firstBrace, lastBrace + 1) : null;
        recommendations = extracted ? JSON.parse(extracted) : { summary: rawText, recommendations: [] };
      } catch {
        recommendations = { summary: rawText, recommendations: [] };
      }
    }

    return NextResponse.json({ recommendations, source: "ai" });
  } catch (err) {
    console.error("[outreach/ai-recommendations] error:", err);
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
