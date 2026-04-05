/**
 * AI extraction pipeline for Fireflies transcripts.
 *
 * Processes a transcript through Claude to extract:
 * - Deal summary and action items
 * - Company details (name, industry, size, focus)
 * - Contact enrichment (roles mentioned)
 * - Suggested TG follow-up message
 * - Stage advancement recommendation
 */
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseAdmin } from "@/lib/supabase";

const MODEL = "claude-sonnet-4-20250514";

export interface AIExtraction {
  deal_summary: string;
  action_items: Array<{ text: string; owner?: string; due?: string }>;
  company_details: {
    name?: string;
    industry?: string;
    size?: string;
    focus_areas?: string[];
    pain_points?: string[];
    funding_stage?: string;
  };
  contact_enrichment: {
    role?: string;
    decision_maker?: boolean;
    communication_style?: string;
  };
  suggested_followup: {
    message: string;
    urgency: "high" | "medium" | "low";
  };
  stage_recommendation: {
    suggested_stage?: string;
    confidence: "high" | "medium" | "low";
    reason: string;
  };
  sentiment_summary: string;
}

/**
 * Run AI extraction on a transcript and store results.
 * Non-blocking — designed to be called after transcript insertion.
 */
export async function processTranscriptAI(
  transcriptId: string,
  dealId: string | null,
  transcript: {
    title?: string;
    summary?: string;
    action_items?: Array<{ text: string }>;
    sentences?: Array<{ speaker_name: string; text: string }>;
    meeting_attendees?: Array<{ displayName: string; email: string }>;
  }
): Promise<AIExtraction | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[fireflies/ai-extract] ANTHROPIC_API_KEY not set");
    return null;
  }

  const admin = createSupabaseAdmin();
  if (!admin) return null;

  // Build context from transcript (use summary + key sentences, not full transcript)
  const transcriptContext = buildTranscriptContext(transcript);

  // Fetch deal context if matched
  let dealContext = "";
  if (dealId) {
    const { data: deal } = await admin
      .from("crm_deals")
      .select("deal_name, board_type, value, notes, stage:pipeline_stages(name)")
      .eq("id", dealId)
      .single();

    if (deal) {
      const stageName = Array.isArray(deal.stage)
        ? (deal.stage[0] as { name: string } | undefined)?.name ?? "Unknown"
        : (deal.stage as { name: string } | null)?.name ?? "Unknown";
      dealContext = `\nDeal context:
- Name: ${deal.deal_name}
- Board: ${deal.board_type}
- Stage: ${stageName}
- Value: ${deal.value ?? "Not set"}
- Existing notes: ${deal.notes ? (deal.notes as string).slice(0, 500) : "None"}`;
    }
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a CRM assistant analyzing a meeting transcript for a crypto/web3 BD team. Extract structured data from this meeting.

Meeting: ${transcript.title ?? "Untitled"}
Attendees: ${transcript.meeting_attendees?.map((a) => `${a.displayName} (${a.email})`).join(", ") ?? "Unknown"}
${dealContext}

Transcript summary and key content:
${transcriptContext}

Respond with valid JSON only (no markdown fences). Use this exact schema:
{
  "deal_summary": "2-3 sentence summary of the meeting outcome and key decisions",
  "action_items": [{"text": "action item description", "owner": "person name or null", "due": "relative date or null"}],
  "company_details": {
    "name": "company name if mentioned",
    "industry": "sector/vertical",
    "size": "team size if mentioned",
    "focus_areas": ["key focus areas discussed"],
    "pain_points": ["problems they want solved"],
    "funding_stage": "seed/series A/etc if mentioned"
  },
  "contact_enrichment": {
    "role": "primary contact's role if mentioned",
    "decision_maker": true/false,
    "communication_style": "brief characterization"
  },
  "suggested_followup": {
    "message": "A natural Telegram follow-up message (2-4 sentences, professional but casual, referencing specific call topics)",
    "urgency": "high/medium/low"
  },
  "stage_recommendation": {
    "suggested_stage": "Follow Up or null",
    "confidence": "high/medium/low",
    "reason": "why this stage is recommended"
  },
  "sentiment_summary": "one sentence on overall meeting sentiment and engagement"
}

Only include fields where you have evidence from the transcript. Use null for unknown values.`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const extraction = JSON.parse(text) as AIExtraction;

    // Store extraction on the transcript record
    await admin
      .from("crm_meeting_transcripts")
      .update({
        ai_extraction: extraction,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transcriptId);

    // Log AI extraction activity on the deal
    if (dealId) {
      await admin.from("crm_deal_activities").insert({
        deal_id: dealId,
        activity_type: "ai_extraction_complete",
        title: `AI analyzed meeting: ${transcript.title ?? "Untitled"}`,
        metadata: {
          transcript_id: transcriptId,
          action_items_count: extraction.action_items?.length ?? 0,
          stage_recommendation: extraction.stage_recommendation?.suggested_stage ?? null,
          sentiment: extraction.sentiment_summary,
        },
        reference_id: transcriptId,
        reference_type: "transcript",
      });
    }

    return extraction;
  } catch (err) {
    console.error("[fireflies/ai-extract] AI extraction failed:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

/**
 * Build a concise transcript context for the AI prompt.
 * Uses summary + first/last segments of sentences to stay within token limits.
 */
function buildTranscriptContext(transcript: {
  summary?: string;
  action_items?: Array<{ text: string }>;
  sentences?: Array<{ speaker_name: string; text: string }>;
}): string {
  const parts: string[] = [];

  if (transcript.summary) {
    parts.push(`Summary: ${transcript.summary}`);
  }

  if (transcript.action_items?.length) {
    parts.push(
      `Action items from transcript:\n${transcript.action_items.map((a) => `- ${a.text}`).join("\n")}`
    );
  }

  // Include key conversation segments (first 30 + last 20 sentences)
  if (transcript.sentences?.length) {
    const first = transcript.sentences.slice(0, 30);
    const last = transcript.sentences.length > 50
      ? transcript.sentences.slice(-20)
      : [];

    const formatSentences = (ss: typeof first) =>
      ss.map((s) => `${s.speaker_name}: ${s.text}`).join("\n");

    parts.push(`Key conversation segments:\n${formatSentences(first)}`);
    if (last.length) {
      parts.push(`[...]\n${formatSentences(last)}`);
    }
  }

  return parts.join("\n\n");
}
