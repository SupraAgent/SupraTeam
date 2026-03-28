/**
 * Computes a 0-100 relationship strength score for a contact pair.
 */

export interface ContactPairData {
  sharedGroupCount: number;
  sharedDealCount: number;
  /** Average min/max message ratio across shared groups (0-1) */
  coEngagementRatio: number;
  /** Days since most recent activity in any shared context */
  mostRecentActivityDaysAgo: number;
  hasExplicitRelationship: boolean;
}

export function computeRelationshipStrength(data: ContactPairData): number {
  const sharedGroups = Math.min(data.sharedGroupCount * 10, 30);
  const sharedDeals = Math.min(data.sharedDealCount * 12, 25);
  const coEngagement = Math.round(data.coEngagementRatio * 20);

  let recency = 0;
  if (data.mostRecentActivityDaysAgo <= 7) recency = 15;
  else if (data.mostRecentActivityDaysAgo <= 14) recency = 10;
  else if (data.mostRecentActivityDaysAgo <= 30) recency = 5;

  const explicit = data.hasExplicitRelationship ? 10 : 0;

  return Math.min(100, sharedGroups + sharedDeals + coEngagement + recency + explicit);
}
