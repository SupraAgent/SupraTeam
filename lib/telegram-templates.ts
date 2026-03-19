/** Telegram message templates (HTML parse_mode) */

export function formatStageChangeMessage(
  dealName: string,
  fromStage: string,
  toStage: string,
  boardType: string,
  changedBy?: string
): string {
  const lines = [
    `<b>Deal Update</b>`,
    ``,
    `<b>${escapeHtml(dealName)}</b>`,
    `${escapeHtml(fromStage)} → ${escapeHtml(toStage)}`,
    `Board: ${escapeHtml(boardType)}`,
  ];
  if (changedBy) {
    lines.push(`By: ${escapeHtml(changedBy)}`);
  }
  return lines.join("\n");
}

export interface DailyDigestStats {
  totalDeals: number;
  byBoard: Record<string, number>;
  byStage: { name: string; count: number }[];
  movesToday: number;
  topDeals: { name: string; board: string; stage: string; value?: number }[];
}

export function formatDailyDigest(stats: DailyDigestStats): string {
  const lines: string[] = [];

  lines.push(`<b>📊 Daily Pipeline Digest</b>`);
  lines.push(``);

  // Total deals by board
  lines.push(`<b>Deals by Board</b> (${stats.totalDeals} total)`);
  for (const [board, count] of Object.entries(stats.byBoard)) {
    lines.push(`  ${escapeHtml(board)}: ${count}`);
  }
  lines.push(``);

  // Deals per stage
  lines.push(`<b>Deals by Stage</b>`);
  for (const stage of stats.byStage) {
    lines.push(`  ${escapeHtml(stage.name)}: ${stage.count}`);
  }
  lines.push(``);

  // Moves today
  lines.push(
    `<b>Activity</b>: ${stats.movesToday} deal${stats.movesToday === 1 ? "" : "s"} moved forward today`
  );

  // Top deals
  if (stats.topDeals.length > 0) {
    lines.push(``);
    lines.push(`<b>Top Deals</b>`);
    for (const deal of stats.topDeals) {
      const valuePart = deal.value != null ? ` ($${deal.value.toLocaleString()})` : "";
      lines.push(
        `  • ${escapeHtml(deal.name)} — ${escapeHtml(deal.stage)}${valuePart}`
      );
    }
  }

  return lines.join("\n");
}

export function formatBroadcastMessage(
  message: string,
  senderName?: string
): string {
  const lines: string[] = [];
  lines.push(`<b>Broadcast</b>`);
  lines.push(``);
  lines.push(escapeHtml(message));
  if (senderName) {
    lines.push(``);
    lines.push(`<i>— ${escapeHtml(senderName)}</i>`);
  }
  return lines.join("\n");
}

/** Escape HTML special chars for Telegram HTML parse_mode */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
