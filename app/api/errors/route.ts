import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { createSupabaseAdmin } from "@/lib/supabase";

interface ErrorPayload {
  severity: "error" | "warning" | "fatal";
  source: "client" | "server" | "api";
  message: string;
  stack?: string;
  component?: string;
  action?: string;
  url?: string;
  fingerprint?: string;
  metadata?: Record<string, unknown>;
}

const VALID_SEVERITIES = new Set(["error", "warning", "fatal"]);
const VALID_SOURCES = new Set(["client", "server", "api"]);

/** POST: Store error reports (batched) */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { errors: ErrorPayload[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!Array.isArray(body.errors) || body.errors.length === 0) {
    return NextResponse.json({ error: "errors array required" }, { status: 400 });
  }

  // Cap batch size
  const errors = body.errors.slice(0, 20);

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const userAgent = request.headers.get("user-agent") ?? undefined;

  const rows = errors
    .filter((e) => e.message && typeof e.message === "string")
    .map((e) => ({
      user_id: auth.user.id,
      severity: VALID_SEVERITIES.has(e.severity) ? e.severity : "error",
      source: VALID_SOURCES.has(e.source) ? e.source : "client",
      message: String(e.message).slice(0, 2000),
      stack: e.stack ? String(e.stack).slice(0, 5000) : null,
      component: e.component ? String(e.component).slice(0, 200) : null,
      action: e.action ? String(e.action).slice(0, 200) : null,
      url: e.url ? String(e.url).slice(0, 500) : null,
      user_agent: userAgent?.slice(0, 500) ?? null,
      fingerprint: e.fingerprint ? String(e.fingerprint).slice(0, 500) : null,
      metadata: e.metadata ?? {},
    }));

  if (rows.length === 0) {
    return NextResponse.json({ stored: 0 });
  }

  const { error } = await supabase.from("crm_error_log").insert(rows);
  if (error) {
    console.error("Failed to store error reports:", error.message);
    return NextResponse.json({ error: "Failed to store" }, { status: 500 });
  }

  return NextResponse.json({ stored: rows.length });
}

/** GET: Retrieve error log (for admin viewer) */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const severity = searchParams.get("severity") ?? undefined;
  const source = searchParams.get("source") ?? undefined;

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let query = supabase
    .from("crm_error_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (severity && VALID_SEVERITIES.has(severity)) {
    query = query.eq("severity", severity);
  }
  if (source && VALID_SOURCES.has(source)) {
    query = query.eq("source", source);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
