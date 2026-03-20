/** Telegram message templates (HTML parse_mode) */

/** Escape HTML special chars for Telegram HTML parse_mode */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render a template string with advanced personalization:
 * - {{var}} — basic variable substitution (HTML-escaped unless key ends with _html)
 * - {{var|fallback}} — default value if var is empty/undefined
 * - {{#if var}}...{{/if}} — conditional blocks (rendered only if var is truthy)
 * - {{#unless var}}...{{/unless}} — inverse conditional blocks
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | undefined>
): string {
  let result = template;

  // Process {{#if var}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, content: string) => {
      const val = vars[key];
      return val !== undefined && val !== null && val !== "" ? content : "";
    }
  );

  // Process {{#unless var}}...{{/unless}} blocks
  result = result.replace(
    /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_match, key: string, content: string) => {
      const val = vars[key];
      return !val || val === "" ? content : "";
    }
  );

  // Process {{var|fallback}} with default values
  result = result.replace(/\{\{(\w+)\|([^}]*)\}\}/g, (_match, key: string, fallback: string) => {
    const val = vars[key];
    if (val === undefined || val === null || val === "") {
      return escapeHtml(fallback);
    }
    if (key.endsWith("_html")) return String(val);
    return escapeHtml(String(val));
  });

  // Process basic {{var}} substitution
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = vars[key];
    if (val === undefined || val === null) return "";
    if (key.endsWith("_html")) return String(val);
    return escapeHtml(String(val));
  });

  return result;
}

/**
 * Available merge variables for personalization.
 * Used by UI to show variable picker chips.
 */
export const MERGE_VARIABLES = {
  contact: [
    { key: "contact_name", label: "Contact Name", hint: "Full name" },
    { key: "contact_first_name", label: "First Name", hint: "First name only" },
    { key: "contact_email", label: "Email", hint: "Primary email" },
    { key: "contact_company", label: "Company", hint: "Organization" },
    { key: "contact_telegram", label: "TG Username", hint: "@username" },
    { key: "contact_phone", label: "Phone", hint: "Phone number" },
    { key: "contact_title", label: "Title", hint: "Job title" },
  ],
  deal: [
    { key: "deal_name", label: "Deal Name", hint: "Deal title" },
    { key: "stage", label: "Stage", hint: "Current pipeline stage" },
    { key: "board_type", label: "Board", hint: "BD/Marketing/Admin" },
    { key: "value", label: "Value", hint: "Deal value" },
  ],
  sender: [
    { key: "sender_name", label: "Sender Name", hint: "Your display name" },
  ],
  system: [
    { key: "today", label: "Today's Date", hint: "YYYY-MM-DD" },
  ],
} as const;

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
