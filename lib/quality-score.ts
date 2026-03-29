/** Compute quality_score based on field completeness. Total = 100. */
export function computeQualityScore(contact: Record<string, unknown>): number {
  let score = 0;
  if (contact.name) score += 10;
  if (contact.email) score += 15;
  if (contact.telegram_username) score += 15;
  if (contact.company) score += 10;
  if (contact.phone) score += 5;
  if (contact.title) score += 5;
  if (contact.x_handle) score += 15;
  if (contact.wallet_address) score += 15;
  if (typeof contact.on_chain_score === "number" && contact.on_chain_score > 0) score += 10;
  return score;
}
