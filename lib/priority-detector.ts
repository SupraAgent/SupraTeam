/**
 * Shared priority and sentiment detection for incoming messages.
 * Used by both the webhook handler and bot message handler.
 *
 * Two-tier detection:
 *   Tier 1 (this file): Instant keyword + pattern matching at message ingestion. Zero latency, zero cost.
 *   Tier 2 (api/highlights/triage): Async AI classification via Claude Haiku for nuanced context.
 *
 * Crypto-BD-specific signals tuned for oracle/DeFi partnership workflows.
 */

// --- Urgent: drop everything, seconds/minutes matter ---
const URGENT_PHRASES = [
  // Generic urgency
  "urgent", "asap", "immediately", "critical", "emergency",
  // Security incidents
  "exploit", "exploited", "hacked", "hack attack", "security breach", "security incident",
  "drained", "funds stolen", "rug pull", "rugged", "depeg", "depegged",
  "bridge compromised", "bridge paused", "bridge halted",
  "oracle manipulation", "oracle attack", "price manipulation",
  // Oracle/integration failures
  "oracle down", "oracle is down", "oracle not working", "oracle issue",
  "stale prices", "stale data", "stale price", "price feed down",
  "feed not responding", "feed returning stale", "feed is down",
  "integration broken", "integration down", "integration failing",
  // Chain/infra incidents
  "chain halted", "chain halt", "rpc down", "rpc issues", "network down",
  // TVL/liquidity crises
  "tvl dropped", "tvl crash", "liquidity crisis", "liquidity drained",
  "bank run", "mass withdrawal",
  // Competitive displacement (immediate threat)
  "going with chainlink", "going with pyth", "going with redstone",
  "switching to chainlink", "switching to pyth", "switching to redstone",
  "pulling out", "pulling the plug", "deal is off", "walking away",
  // Hard deadlines
  "need confirmation by eod", "deadline today", "expires today",
  "listing slot", "lose the listing", "launch is tomorrow",
];

// --- High: same-day response needed, hours matter ---
const HIGH_PHRASES = [
  // Deal/contract signals
  "ready to sign", "send the mou", "sign the mou", "mou redlines",
  "term sheet", "loi", "letter of intent",
  "contract", "payment", "invoice", "approve", "confirm",
  "grant approved", "grant deadline", "grant agreement",
  "token allocation", "vesting schedule",
  // Decision/commitment signals
  "board decision", "speaking with legal", "legal reviewed",
  "need your decision", "waiting on your approval",
  "need to talk", "can we hop on a call",
  // Timeline compression
  "tge", "token generation", "token launch", "mainnet launch",
  "going live", "deploying to mainnet", "launch date moved",
  "listing deadline", "listing in",
  // Competitor mentions (awareness, not displacement)
  "chainlink", "pyth", "redstone", "api3", "dia oracle",
  "evaluating alternatives", "exploring other options", "got another offer",
  // Funding/business signals
  "closed our round", "series a", "series b", "just raised",
  "ready to move forward", "ready to integrate",
  // Technical blockers
  "devs are stuck", "blocked on", "blocker",
  "can you connect them with", "need engineering support",
  // Governance with timeline
  "governance vote", "governance proposal", "vote closes",
  "snapshot vote", "tally vote",
];

// --- Negative sentiment ---
const NEGATIVE_WORDS = [
  // Frustration/dissatisfaction
  "cancel", "delay", "delayed", "problem", "issue",
  "disappointed", "frustrated", "concerned", "not happy", "unacceptable",
  "been waiting", "no response", "still waiting", "ignored",
  // Deal risk signals
  "reassessing", "reconsidering", "deprioritize", "deprioritizing",
  "putting on hold", "pausing the integration", "timeline slipping",
  "restructuring", "downsizing", "runway concerns",
  // Negative crypto signals
  "audit failed", "audit findings", "vulnerability found",
];

// --- Positive sentiment ---
const POSITIVE_WORDS = [
  "excited", "great", "love", "perfect", "amazing",
  "deal", "agree", "yes", "let's do it", "looks good",
  "deployed to testnet", "integration complete", "tests passing",
  "ready to launch", "milestone reached",
  "closed our round", "just raised", "funded",
];

// --- False positive suppression: skip these even if keywords match ---
const FALSE_POSITIVE_PATTERNS = [
  /\bhackathon\b/i,
  /\bhack\s*(?:day|week|night|together|on|a solution|something)\b/i,
  /\blife\s*hack\b/i,
  /\bnvm\b.*\b(?:back|fixed|resolved|working)\b/i,
  /\b(?:back|fixed|resolved|working)\b.*\bnvm\b/i,
  /\bit'?s\s*back\b/i,
  /\b(?:issue|problem)\s*(?:resolved|fixed|closed)\b/i,
];

export type Priority = "low" | "medium" | "high" | "urgent";
export type Sentiment = "positive" | "neutral" | "negative";

/**
 * Detect message urgency category for crypto-BD workflows.
 * Returns: "urgent" | "high" | "medium" | "low"
 */
export function detectPriority(text: string): Priority {
  const lower = text.toLowerCase();

  // Check false positive patterns first — suppress if the message resolves an issue
  if (FALSE_POSITIVE_PATTERNS.some((p) => p.test(text))) return "medium";

  if (URGENT_PHRASES.some((w) => lower.includes(w))) return "urgent";
  if (HIGH_PHRASES.some((w) => lower.includes(w))) return "high";

  // Message velocity hint: very long messages (3+ lines) from a contact often signal urgency
  if (text.split("\n").length >= 4 && text.length > 300) return "medium";

  return "medium";
}

/**
 * Detect message sentiment for CRM context.
 * Returns: "positive" | "neutral" | "negative"
 */
export function detectSentiment(text: string): Sentiment {
  const lower = text.toLowerCase();

  // Check false positives first
  if (FALSE_POSITIVE_PATTERNS.some((p) => p.test(text))) return "neutral";

  if (NEGATIVE_WORDS.some((w) => lower.includes(w))) return "negative";
  if (POSITIVE_WORDS.some((w) => lower.includes(w))) return "positive";
  return "neutral";
}

/**
 * Urgency category for the 6-category crypto-BD taxonomy.
 * Used by the AI triage prompt and UI rendering.
 */
export type UrgencyCategory =
  | "security"        // exploits, hacks, oracle failures — always critical
  | "deal_risk"       // competitor moves, churn signals, TVL drops — critical or high
  | "time_bound"      // TGE dates, vesting cliffs, grant deadlines — high
  | "decision_needed" // pricing, token allocation, legal review — high
  | "follow_up"       // general business continuity — medium
  | "noise";          // greetings, automated messages, FYI — low

/**
 * Quick keyword-based category hint (Tier 1).
 * The AI triage (Tier 2) refines this with full context.
 */
export function detectCategory(text: string): UrgencyCategory {
  const lower = text.toLowerCase();

  // Security signals
  const securityTerms = ["exploit", "hacked", "hack attack", "drained", "rug", "depeg",
    "bridge compromised", "bridge paused", "oracle manipulation", "oracle attack",
    "security breach", "security incident", "funds stolen", "vulnerability"];
  if (securityTerms.some((w) => lower.includes(w))) return "security";

  // Deal risk signals
  const dealRiskTerms = ["pulling out", "walking away", "deal is off", "going with",
    "switching to", "evaluating alternatives", "exploring other options",
    "reassessing", "reconsidering", "deprioritize", "putting on hold",
    "restructuring", "downsizing", "runway concerns"];
  if (dealRiskTerms.some((w) => lower.includes(w))) return "deal_risk";

  // Time-bound signals
  const timeBoundTerms = ["tge", "token generation", "token launch", "mainnet launch",
    "launch date", "listing deadline", "vesting cliff", "grant deadline",
    "vote closes", "deadline", "expires", "going live", "deploying to mainnet"];
  if (timeBoundTerms.some((w) => lower.includes(w))) return "time_bound";

  // Decision needed
  const decisionTerms = ["ready to sign", "mou", "term sheet", "loi", "legal reviewed",
    "board decision", "need your decision", "approve", "token allocation",
    "pricing discussion", "need to talk"];
  if (decisionTerms.some((w) => lower.includes(w))) return "decision_needed";

  // Noise detection
  const noiseTerms = ["gm", "gn", "good morning", "good night", "thanks for the call",
    "talk soon", "ttyl", "when token", "when moon"];
  if (noiseTerms.some((w) => lower.includes(w)) && text.length < 50) return "noise";

  return "follow_up";
}
