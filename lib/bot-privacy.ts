/**
 * Bot privacy layer — controls what data the bot exposes per group.
 *
 * Privacy levels:
 *   full    — Internal team groups. Show deal names, values, stages, contacts.
 *   limited — Partner groups. Show stage names but NOT values or contact details.
 *   minimal — External groups. Generic messages only, no deal-specific data.
 */

import { escapeHtml } from "./telegram-templates";

export type PrivacyLevel = "full" | "limited" | "minimal";

interface DealInfo {
  deal_name: string;
  board_type?: string;
  stage_name?: string;
  value?: number | null;
}

/**
 * Format a deal reference for bot messages, respecting privacy level.
 */
export function formatDealForGroup(deal: DealInfo, privacy: PrivacyLevel): string {
  switch (privacy) {
    case "full":
      return `${deal.deal_name} (${deal.stage_name ?? "Unknown"}${deal.value != null ? `, $${deal.value.toLocaleString()}` : ""})`;
    case "limited":
      return `${deal.deal_name} — ${deal.stage_name ?? "Unknown"}`;
    case "minimal":
      return "a deal";
  }
}

/**
 * Format stage change notification for bot messages, respecting privacy level.
 */
export function formatStageChangeForGroup(
  dealName: string,
  fromStage: string,
  toStage: string,
  boardType: string,
  changedBy: string,
  privacy: PrivacyLevel
): string {
  switch (privacy) {
    case "full":
      return `📊 <b>${escapeHtml(dealName)}</b> (${escapeHtml(boardType)})\n${escapeHtml(fromStage)} → ${escapeHtml(toStage)}\nby ${escapeHtml(changedBy)}`;
    case "limited":
      return `📊 <b>${escapeHtml(dealName)}</b>\n${escapeHtml(fromStage)} → ${escapeHtml(toStage)}`;
    case "minimal":
      return `📊 A deal moved to <b>${escapeHtml(toStage)}</b>`;
  }
}

/**
 * Determine if top deals section should be included in digest.
 */
export function shouldShowTopDeals(privacy: PrivacyLevel): boolean {
  return privacy === "full";
}

/**
 * Determine if deal values should be shown.
 */
export function shouldShowValues(privacy: PrivacyLevel): boolean {
  return privacy === "full";
}
