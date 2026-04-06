/** Telegram message templates (HTML parse_mode) */

/** Escape HTML special chars for Telegram HTML parse_mode */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Apply text transform filters to a value.
 * Supported: upper, lower, capitalize, truncate:N, date:format
 */
function applyFilters(value: string, filters: string[]): string {
  let result = value;
  for (const f of filters) {
    const trimmed = f.trim();
    if (trimmed === "upper") {
      result = result.toUpperCase();
    } else if (trimmed === "lower") {
      result = result.toLowerCase();
    } else if (trimmed === "capitalize") {
      result = result.replace(/\b\w/g, (c) => c.toUpperCase());
    } else if (trimmed.startsWith("truncate:")) {
      const len = parseInt(trimmed.slice(9), 10);
      if (!isNaN(len) && result.length > len) {
        result = result.slice(0, len) + "…";
      }
    } else if (trimmed.startsWith("date:")) {
      const fmt = trimmed.slice(5);
      try {
        const d = new Date(result);
        if (!isNaN(d.getTime())) {
          if (fmt === "short") result = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          else if (fmt === "long") result = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          else if (fmt === "iso") result = d.toISOString().slice(0, 10);
          else if (fmt === "relative") {
            const diff = Date.now() - d.getTime();
            const days = Math.floor(Math.abs(diff) / 86400000);
            if (diff < 0) {
              // Future dates
              if (days === 0) result = "today";
              else if (days === 1) result = "tomorrow";
              else if (days < 7) result = `in ${days} days`;
              else if (days < 30) result = `in ${Math.floor(days / 7)} weeks`;
              else result = `in ${Math.floor(days / 30)} months`;
            } else {
              // Past dates
              if (days === 0) result = "today";
              else if (days === 1) result = "yesterday";
              else if (days < 7) result = `${days} days ago`;
              else if (days < 30) result = `${Math.floor(days / 7)} weeks ago`;
              else result = `${Math.floor(days / 30)} months ago`;
            }
          }
        }
      } catch {}
    } else if (trimmed.startsWith("number")) {
      const num = Number(result);
      if (!isNaN(num)) result = num.toLocaleString();
    } else if (trimmed === "currency") {
      const num = Number(result);
      if (!isNaN(num)) result = `$${num.toLocaleString()}`;
    }
  }
  return result;
}

/**
 * Parse a variable expression like "var|filter1|filter2" or "var|fallback".
 * Returns { key, filters, fallback }.
 * Heuristic: if first pipe segment matches a known filter name, treat all as filters.
 * Otherwise, treat the first as fallback text (backward compatible).
 */
const KNOWN_FILTERS = new Set(["upper", "lower", "capitalize", "number", "currency"]);
function parseVarExpr(expr: string): { key: string; filters: string[]; fallback: string | null } {
  const parts = expr.split("|");
  const key = parts[0].trim();
  if (parts.length === 1) return { key, filters: [], fallback: null };
  const rest = parts.slice(1);
  // Check if first part looks like a filter
  const firstPart = rest[0].trim();
  const isFilter = KNOWN_FILTERS.has(firstPart) || firstPart.startsWith("truncate:") || firstPart.startsWith("date:") || firstPart === "currency";
  if (isFilter) {
    return { key, filters: rest, fallback: null };
  }
  // Backward compat: single pipe = fallback
  return { key, filters: [], fallback: rest.join("|") };
}

/**
 * Render a template string with advanced personalization:
 * - {{var}} — basic variable substitution (HTML-escaped unless key ends with _html)
 * - {{var|fallback}} — default value if var is empty/undefined
 * - {{var|upper}}, {{var|lower}}, {{var|capitalize}} — text transforms
 * - {{var|truncate:N}} — truncate to N characters
 * - {{var|date:short}}, {{var|date:long}}, {{var|date:relative}} — date formatting
 * - {{var|number}}, {{var|currency}} — number formatting ($1,234)
 * - {{#if var}}...{{/if}} — conditional blocks (rendered only if var is truthy)
 * - {{#unless var}}...{{/unless}} — inverse conditional blocks
 * - {{#ifgt var N}}...{{/ifgt}} — conditional: var > N (numeric comparison)
 * - {{#iflt var N}}...{{/iflt}} — conditional: var < N (numeric comparison)
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

  // Process {{#ifgt var N}}...{{/ifgt}} blocks (greater than)
  result = result.replace(
    /\{\{#ifgt\s+(\w+)\s+(\d+(?:\.\d+)?)\}\}([\s\S]*?)\{\{\/ifgt\}\}/g,
    (_match, key: string, threshold: string, content: string) => {
      const val = Number(vars[key]);
      return !isNaN(val) && val > Number(threshold) ? content : "";
    }
  );

  // Process {{#iflt var N}}...{{/iflt}} blocks (less than)
  result = result.replace(
    /\{\{#iflt\s+(\w+)\s+(\d+(?:\.\d+)?)\}\}([\s\S]*?)\{\{\/iflt\}\}/g,
    (_match, key: string, threshold: string, content: string) => {
      const val = Number(vars[key]);
      return !isNaN(val) && val < Number(threshold) ? content : "";
    }
  );

  // Process {{var|filters_or_fallback}} expressions
  result = result.replace(/\{\{(\w+(?:\|[^}]+)?)\}\}/g, (_match, expr: string) => {
    const { key, filters, fallback } = parseVarExpr(expr);
    const val = vars[key];

    if (val === undefined || val === null || val === "") {
      if (fallback !== null) return escapeHtml(fallback);
      return "";
    }

    let strVal = String(val);
    if (filters.length > 0) {
      strVal = applyFilters(strVal, filters);
    }

    if (key.endsWith("_html")) return strVal;
    return escapeHtml(strVal);
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
    { key: "contact_tags", label: "Tags", hint: "Comma-separated tags" },
  ],
  deal: [
    { key: "deal_name", label: "Deal Name", hint: "Deal title" },
    { key: "stage", label: "Stage", hint: "Current pipeline stage" },
    { key: "previous_stage", label: "Previous Stage", hint: "Stage before last move" },
    { key: "board_type", label: "Board", hint: "BD/Marketing/Admin" },
    { key: "value", label: "Value", hint: "Deal value (raw number)" },
    { key: "value_formatted", label: "Value ($)", hint: "Deal value with $ and commas" },
    { key: "probability", label: "Probability", hint: "Win probability %" },
    { key: "weighted_value", label: "Weighted Value", hint: "Value × probability" },
    { key: "deal_age_days", label: "Deal Age", hint: "Days since creation" },
    { key: "stage_days", label: "Days in Stage", hint: "Days in current stage" },
    { key: "expected_close", label: "Expected Close", hint: "Expected close date" },
    { key: "outcome", label: "Outcome", hint: "open/won/lost" },
  ],
  sender: [
    { key: "sender_name", label: "Sender Name", hint: "Your display name" },
    { key: "sender_email", label: "Sender Email", hint: "Your email address" },
  ],
  group: [
    { key: "group_name", label: "Group Name", hint: "Telegram group name" },
    { key: "group_member_count", label: "Member Count", hint: "Group member count" },
    { key: "group_slugs", label: "Group Tags", hint: "Comma-separated tags" },
  ],
  system: [
    { key: "today", label: "Today's Date", hint: "YYYY-MM-DD" },
    { key: "current_time", label: "Current Time", hint: "HH:MM" },
    { key: "current_month", label: "Current Month", hint: "e.g. March" },
    { key: "current_year", label: "Current Year", hint: "e.g. 2026" },
  ],
} as const;

/** Available text transform filters for the template engine */
export const TEMPLATE_FILTERS = [
  { key: "upper", label: "UPPERCASE", hint: "Convert to uppercase", example: "{{contact_name|upper}}" },
  { key: "lower", label: "lowercase", hint: "Convert to lowercase", example: "{{contact_name|lower}}" },
  { key: "capitalize", label: "Capitalize", hint: "Capitalize each word", example: "{{contact_name|capitalize}}" },
  { key: "currency", label: "Currency ($)", hint: "Format as $1,234", example: "{{value|currency}}" },
  { key: "number", label: "Number", hint: "Format with commas", example: "{{value|number}}" },
  { key: "truncate:30", label: "Truncate 30", hint: "Limit to 30 chars", example: "{{deal_name|truncate:30}}" },
  { key: "date:short", label: "Date (Short)", hint: "Mar 20", example: "{{today|date:short}}" },
  { key: "date:relative", label: "Date (Relative)", hint: "3 days ago", example: "{{expected_close|date:relative}}" },
] as const;

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

/**
 * Format a pinned deal status summary for a TG group.
 * This gets pinned after stage changes so the group always shows current deal status.
 */
export function formatPinnedDealStatus(
  dealName: string,
  stageName: string,
  boardType: string,
  assignedTo?: string,
): string {
  const lines = [
    `<b>📌 Deal Status</b>`,
    ``,
    `<b>Deal:</b> ${escapeHtml(dealName)}`,
    `<b>Stage:</b> ${escapeHtml(stageName)}`,
    `<b>Board:</b> ${escapeHtml(boardType)}`,
  ];
  if (assignedTo) lines.push(`<b>Assigned:</b> ${escapeHtml(assignedTo)}`);
  lines.push(``, `<i>Updated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</i>`);
  return lines.join("\n");
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
