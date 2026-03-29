/**
 * Server-side HTML sanitizer for email content (templates, drafts, forwarded bodies).
 *
 * Uses a two-pass approach:
 * 1. Strip all content inside dangerous tags (script, style, iframe, etc.)
 * 2. Allowlist-based tag and attribute filtering
 *
 * This replaces the previous regex-only approach which could be bypassed
 * by malformed tags (missing closing >), HTML comments, and CDATA sections.
 */

const ALLOWED_TAGS = new Set([
  "div", "span", "p", "br", "a", "b", "strong", "i", "em", "u",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "td", "th",
  "blockquote", "pre", "code", "hr",
]);

const ALLOWED_ATTRS = new Set([
  "href", "alt", "title", "width", "height", "target", "rel", "class",
  "colspan", "rowspan", "align", "valign",
]);

const DANGEROUS_URI = /^\s*(javascript|data|vbscript)\s*:/i;

/** Sanitize HTML for email templates, drafts, and forwarded content */
export function sanitizeTemplateHtml(html: string): string {
  // Pass 1: Strip dangerous tag content entirely (including their inner text)
  let clean = html
    .replace(/<script[\s>][\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style[\s>][\s\S]*?<\/style\s*>/gi, "")
    .replace(/<iframe[\s>][\s\S]*?<\/iframe\s*>/gi, "")
    .replace(/<object[\s>][\s\S]*?<\/object\s*>/gi, "")
    .replace(/<embed[\s>][\s\S]*?<\/embed\s*>/gi, "")
    .replace(/<svg[\s>][\s\S]*?<\/svg\s*>/gi, "")
    .replace(/<math[\s>][\s\S]*?<\/math\s*>/gi, "");

  // Strip HTML comments and CDATA
  clean = clean.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  // Strip self-closing dangerous tags (no closing pair)
  clean = clean.replace(/<(script|style|iframe|object|embed|svg|math|link|meta|base)\b[^>]*\/?>/gi, "");

  // Pass 2: Strip malformed tags (missing closing >) — catches truncated injection attempts
  // Match any < followed by tag-like content that doesn't have a proper >
  clean = clean.replace(/<[a-zA-Z][^>]*$/gm, "");

  // Pass 3: Allowlist-based tag and attribute filtering
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/gi, (match, tagName: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";

    if (match.startsWith("</")) return `</${tag}>`;

    const selfClosing = match.trimEnd().endsWith("/>") || tag === "br" || tag === "hr";
    const attrString = match.replace(/^<[a-zA-Z][a-zA-Z0-9]*\s*/, "").replace(/\/?>$/, "");
    const safeAttrs: string[] = [];

    const attrRegex = /([a-zA-Z][\w-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

      if (attrName.startsWith("on")) continue;
      if (!ALLOWED_ATTRS.has(attrName)) continue;
      if (attrName === "href" && DANGEROUS_URI.test(decodeURIComponent(attrVal))) continue;

      safeAttrs.push(`${attrName}="${attrVal.replace(/"/g, "&quot;")}"`);
    }

    const attrs = safeAttrs.length > 0 ? ` ${safeAttrs.join(" ")}` : "";
    return selfClosing ? `<${tag}${attrs} />` : `<${tag}${attrs}>`;
  });

  return clean;
}
