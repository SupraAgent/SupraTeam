/**
 * Computes a 0-100 influence score for a deal participant.
 */

export interface ParticipantInfluenceData {
  stageChangesAttributed: number;
  messageCount30d: number;
  /** Highest message count among all participants in the deal group */
  maxMessageCount30dInGroup: number;
  highlightCount: number;
  hasOutreachReply: boolean;
  daysSinceLastInteraction: number;
}

export function computeInfluenceScore(data: ParticipantInfluenceData): number {
  // Stage changes: up to 25
  const stageScore = Math.min(data.stageChangesAttributed * 8, 25);

  // Message activity: up to 25 (normalized against group max)
  const msgRatio =
    data.maxMessageCount30dInGroup > 0
      ? data.messageCount30d / data.maxMessageCount30dInGroup
      : 0;
  const messageScore = Math.round(msgRatio * 25);

  // Highlights: up to 20
  const highlightScore = Math.min(data.highlightCount * 5, 20);

  // Outreach engagement: up to 15
  const outreachScore = data.hasOutreachReply ? 15 : 0;

  // Recency: up to 15
  let recencyScore = 0;
  if (data.daysSinceLastInteraction <= 7) recencyScore = 15;
  else if (data.daysSinceLastInteraction <= 14) recencyScore = 10;
  else if (data.daysSinceLastInteraction <= 30) recencyScore = 5;

  return Math.min(
    100,
    stageScore + messageScore + highlightScore + outreachScore + recencyScore
  );
}
