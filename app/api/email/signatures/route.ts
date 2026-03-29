import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** Strip dangerous HTML — allowlist-based: only permitted tags and safe attributes survive */
function sanitizeSignatureHtml(html: string): string {
  const ALLOWED_TAGS = new Set(["b", "i", "u", "strong", "em", "br", "p", "a", "span", "div", "table", "tr", "td", "th", "tbody", "thead", "hr"]);
  const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "width", "height", "class", "colspan", "rowspan", "align", "valign", "border", "cellpadding", "cellspacing"]);
  const DANGEROUS_URI = /^\s*(javascript|data|vbscript)\s*:/i;
  const DANGEROUS_CSS = /expression\s*\(|url\s*\(\s*(javascript|data|vbscript)\s*:/i;

  // Strip all tags not in the allowlist, keep their text content
  let clean = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/gi, (match, tagName: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";

    // For closing tags, pass through
    if (match.startsWith("</")) return `</${tag}>`;

    // Parse and filter attributes — only allow safe ones
    const selfClosing = match.trimEnd().endsWith("/>") || tag === "br" || tag === "img" || tag === "hr";
    const attrString = match.replace(/^<[a-zA-Z][a-zA-Z0-9]*\s*/, "").replace(/\/?>$/, "");
    const safeAttrs: string[] = [];

    // Match attributes: name="value", name='value', name=value, or standalone
    const attrRegex = /([a-zA-Z][\w-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

      // Block all on* event handlers
      if (attrName.startsWith("on")) continue;
      // Block non-allowed attributes
      if (!ALLOWED_ATTRS.has(attrName)) continue;
      // Block dangerous URI schemes in href/src (handles encoded forms too)
      if ((attrName === "href" || attrName === "src") && DANGEROUS_URI.test(decodeURIComponent(attrVal))) continue;
      // Block CSS expressions and JS-in-CSS in style attributes
      if (attrName === "style" && DANGEROUS_CSS.test(decodeURIComponent(attrVal))) continue;

      safeAttrs.push(`${attrName}="${attrVal.replace(/"/g, "&quot;")}"`);
    }

    const attrs = safeAttrs.length > 0 ? ` ${safeAttrs.join(" ")}` : "";
    return selfClosing ? `<${tag}${attrs} />` : `<${tag}${attrs}>`;
  });

  return clean;
}

/** GET: Get signature for a connection */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connection_id");

  let query = auth.admin
    .from("crm_email_connections")
    .select("id, email, writing_style_json")
    .eq("user_id", auth.user.id);

  if (connectionId) {
    query = query.eq("id", connectionId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  // Extract signatures from writing_style_json
  const signatures = (data ?? []).map((conn) => ({
    connection_id: conn.id,
    email: conn.email,
    signature_html: (conn.writing_style_json as Record<string, unknown>)?.signature_html ?? "",
    signature_text: (conn.writing_style_json as Record<string, unknown>)?.signature_text ?? "",
  }));

  return NextResponse.json({ data: signatures, source: "supabase" });
}

/** POST: Update signature for a connection */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { connection_id: string; signature_html: string; signature_text: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.connection_id) {
    return NextResponse.json({ error: "connection_id required" }, { status: 400 });
  }

  // Get current writing_style_json
  const { data: conn } = await auth.admin
    .from("crm_email_connections")
    .select("writing_style_json")
    .eq("id", body.connection_id)
    .eq("user_id", auth.user.id)
    .single();

  const existing = (conn?.writing_style_json as Record<string, unknown>) ?? {};

  const { error } = await auth.admin
    .from("crm_email_connections")
    .update({
      writing_style_json: {
        ...existing,
        signature_html: sanitizeSignatureHtml(body.signature_html),
        signature_text: body.signature_text.replace(/<[^>]+>/g, ""),
      },
    })
    .eq("id", body.connection_id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save signature" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
