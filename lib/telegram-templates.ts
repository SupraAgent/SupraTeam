/** Telegram message templates (HTML parse_mode) */

/** Escape HTML special chars for Telegram HTML parse_mode */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render a template string by replacing {{placeholder}} with values.
 * Values are HTML-escaped unless the key ends with _html.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = vars[key];
    if (val === undefined || val === null) return "";
    if (key.endsWith("_html")) return String(val); // pre-escaped
    return escapeHtml(String(val));
  });
}

// ── Default templates (used as fallbacks when DB templates not loaded) ──

const DEFAULT_STAGE_CHANGE = `<b>Deal Update</b>

<b>{{deal_name}}</b>
{{from_stage}} → {{to_stage}}
Board: {{board_type}}
By: {{changed_by}}`;

const DEFAULT_BROADCAST = `<b>Broadcast</b>

{{message}}

<i>— {{sender_name}}</i>`;

// ── Formatting functions (backward compatible) ──

export function formatStageChangeMessage(
  dealName: string,
  fromStage: string,
  toStage: string,
  boardType: string,
  changedBy?: string,
  customTemplate?: string
): string {
  const template = customTemplate || DEFAULT_STAGE_CHANGE;
  return renderTemplate(template, {
    deal_name: dealName,
    from_stage: fromStage,
    to_stage: toStage,
    board_type: boardType,
    changed_by: changedBy ?? "Unknown",
  });
}

export interface DailyDigestStats {
  totalDeals: number;
  byBoard: Record<string, number>;
  byStage: { name: string; count: number }[];
  movesToday: number;
  topDeals: { name: string; board: string; stage: string; value?: number }[];
}

export function formatDailyDigest(
  stats: DailyDigestStats,
  customTemplate?: string
): string {
  // Build sub-sections as pre-formatted HTML
  const boardLines = Object.entries(stats.byBoard)
    .map(([board, count]) => `  ${escapeHtml(board)}: ${count}`)
    .join("\n");

  const stageLines = stats.byStage
    .map((s) => `  ${escapeHtml(s.name)}: ${s.count}`)
    .join("\n");

  let topDealsSection = "";
  if (stats.topDeals.length > 0) {
    const dealLines = stats.topDeals
      .map((d) => {
        const valuePart = d.value != null ? ` ($${d.value.toLocaleString()})` : "";
        return `  • ${escapeHtml(d.name)} — ${escapeHtml(d.stage)}${valuePart}`;
      })
      .join("\n");
    topDealsSection = `<b>Top Deals</b>\n${dealLines}`;
  }

  if (customTemplate) {
    return renderTemplate(customTemplate, {
      total_deals: stats.totalDeals,
      board_summary_html: boardLines,
      stage_summary_html: stageLines,
      moves_today: stats.movesToday,
      top_deals_section_html: topDealsSection,
    });
  }

  // Default format (original behavior)
  const lines: string[] = [];
  lines.push(`<b>📊 Daily Pipeline Digest</b>`);
  lines.push(``);
  lines.push(`<b>Deals by Board</b> (${stats.totalDeals} total)`);
  lines.push(boardLines);
  lines.push(``);
  lines.push(`<b>Deals by Stage</b>`);
  lines.push(stageLines);
  lines.push(``);
  lines.push(
    `<b>Activity</b>: ${stats.movesToday} deal${stats.movesToday === 1 ? "" : "s"} moved forward today`
  );
  if (topDealsSection) {
    lines.push(``);
    lines.push(topDealsSection);
  }
  return lines.join("\n");
}

export function formatBroadcastMessage(
  message: string,
  senderName?: string,
  customTemplate?: string
): string {
  const template = customTemplate || DEFAULT_BROADCAST;
  return renderTemplate(template, {
    message,
    sender_name: senderName ?? "",
  });
}
