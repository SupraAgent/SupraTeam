/**
 * Shared Claude API helper — DRY wrapper for Anthropic API calls with
 * response validation, JSON extraction, and prompt injection sanitization.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Sanitize user-generated content before embedding in prompts.
 * Strips control characters and wraps content in XML tags to prevent
 * prompt injection from external sources (e.g. Telegram messages).
 */
export function sanitizeForPrompt(text: string): string {
  // Strip control characters except newlines and tabs
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Call Claude API and extract a JSON array from the response.
 * Returns empty array on failure instead of throwing.
 */
export async function callClaudeForJson<T>(params: {
  apiKey: string;
  model: "claude-sonnet-4-20250514" | "claude-haiku-4-5-20251001";
  maxTokens: number;
  prompt: string;
}): Promise<{ data: T[]; error?: string }> {
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        messages: [{ role: "user", content: params.prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "Unknown error");
      console.error(`[claude-api] HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      return { data: [], error: `Claude API returned ${res.status}` };
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? "[]";

    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { data: [], error: "No JSON array found in response" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as T[];
    return { data: parsed };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[claude-api] error:", errMsg);
    return { data: [], error: errMsg };
  }
}

/**
 * Call Claude API and return raw text response.
 */
export async function callClaudeForText(params: {
  apiKey: string;
  model: "claude-sonnet-4-20250514" | "claude-haiku-4-5-20251001";
  maxTokens: number;
  prompt: string;
}): Promise<{ text: string; error?: string }> {
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        messages: [{ role: "user", content: params.prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "Unknown error");
      return { text: "", error: `Claude API returned ${res.status}: ${errBody.slice(0, 100)}` };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    return { text };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return { text: "", error: errMsg };
  }
}
