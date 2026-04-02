/**
 * Shared priority and sentiment detection for incoming messages.
 * Used by both the webhook handler and bot message handler.
 */

const URGENT_WORDS = ["urgent", "asap", "immediately", "critical", "deadline"];
const HIGH_WORDS = ["ready to sign", "contract", "payment", "invoice", "approve", "confirm"];
const NEGATIVE_WORDS = ["cancel", "delay", "problem", "issue", "disappointed", "frustrated", "concerned"];
const POSITIVE_WORDS = ["excited", "great", "love", "perfect", "amazing", "deal", "agree", "yes"];

export type Priority = "low" | "medium" | "high" | "urgent";
export type Sentiment = "positive" | "neutral" | "negative";

export function detectPriority(text: string): Priority {
  const lower = text.toLowerCase();
  if (URGENT_WORDS.some((w) => lower.includes(w))) return "urgent";
  if (HIGH_WORDS.some((w) => lower.includes(w))) return "high";
  return "medium";
}

export function detectSentiment(text: string): Sentiment {
  const lower = text.toLowerCase();
  if (NEGATIVE_WORDS.some((w) => lower.includes(w))) return "negative";
  if (POSITIVE_WORDS.some((w) => lower.includes(w))) return "positive";
  return "neutral";
}
