import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface TranscriptionOptions {
  language?: string;
  context?: string;
}

interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
}

interface ActionItem {
  text: string;
  assignee_hint: string | null;
  deadline_hint: string | null;
  priority: "high" | "medium" | "low";
}

interface SentimentResult {
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
}

/**
 * Transcribe a voice message using the Anthropic Messages API with audio content.
 *
 * Telegram voice notes are OGG/OPUS (.oga). The Anthropic API supports audio
 * content blocks natively; we use a raw API call since the SDK types may not
 * include audio content blocks yet.
 */
export async function transcribeVoiceMessage(
  fileBuffer: Buffer,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const base64Audio = fileBuffer.toString("base64");
  const languageHint = options.language ? `The audio is likely in ${options.language}.` : "";
  const contextHint = options.context ? `Context: ${options.context}` : "";

  const promptText = `Transcribe this voice message accurately. ${languageHint} ${contextHint}

Return ONLY a JSON object (no markdown, no code fences):
{"text": "the full transcription", "language": "detected language code (e.g. en, ru, zh)", "confidence": 0.95}

If the audio is unclear or empty, return {"text": "", "language": "unknown", "confidence": 0.0}`;

  // Use raw API call to support audio content type (SDK types may lag behind API support)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "audio/ogg",
                data: base64Audio,
              },
            },
            {
              type: "text",
              text: promptText,
            },
          ],
        },
      ],
    }),
  });

  if (!apiResponse.ok) {
    const errorBody = await apiResponse.text();
    throw new Error(`Anthropic API error ${apiResponse.status}: ${errorBody}`);
  }

  const responseJson = (await apiResponse.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const content = responseJson.content[0];
  if (content.type !== "text" || !content.text) {
    return { text: "", language: "unknown", confidence: 0 };
  }

  try {
    const parsed = JSON.parse(content.text) as TranscriptionResult;
    return {
      text: parsed.text || "",
      language: parsed.language || "unknown",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch {
    // If Claude returned plain text instead of JSON, treat it as the transcription
    return { text: content.text.trim(), language: "unknown", confidence: 0.5 };
  }
}

/**
 * Extract action items from transcription text using Claude.
 */
export async function extractActionItems(transcription: string): Promise<ActionItem[]> {
  if (!transcription.trim()) return [];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Extract action items from this voice message transcription. Look for tasks, commitments, follow-ups, deadlines, and assignments.

Transcription:
"""
${transcription}
"""

Return ONLY a JSON array (no markdown, no code fences):
[{"text": "action item description", "assignee_hint": "person name or null", "deadline_hint": "deadline mention or null", "priority": "high|medium|low"}]

If no action items found, return []`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return [];

  try {
    const parsed = JSON.parse(content.text) as ActionItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Analyze sentiment of transcription text.
 */
export async function analyzeSentiment(transcription: string): Promise<SentimentResult> {
  if (!transcription.trim()) {
    return { sentiment: "neutral", confidence: 0 };
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `Classify the sentiment of this voice message transcription as positive, neutral, or negative. Consider tone, word choice, and overall message intent in a business/deal context.

Transcription:
"""
${transcription}
"""

Return ONLY a JSON object (no markdown, no code fences):
{"sentiment": "positive|neutral|negative", "confidence": 0.85}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return { sentiment: "neutral", confidence: 0.5 };

  try {
    const parsed = JSON.parse(content.text) as SentimentResult;
    const valid = ["positive", "neutral", "negative"] as const;
    return {
      sentiment: valid.includes(parsed.sentiment as typeof valid[number])
        ? (parsed.sentiment as SentimentResult["sentiment"])
        : "neutral",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch {
    return { sentiment: "neutral", confidence: 0.5 };
  }
}

/**
 * Generate a one-line summary for timeline display.
 */
export async function generateSummary(transcription: string): Promise<string> {
  if (!transcription.trim()) return "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `Summarize this voice message in ONE short sentence (max 120 chars) for a CRM deal timeline. Focus on the key point or decision.

Transcription:
"""
${transcription}
"""

Return ONLY the summary sentence, nothing else.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return "";
  return content.text.trim().slice(0, 200);
}

export type { TranscriptionResult, ActionItem, SentimentResult, TranscriptionOptions };
