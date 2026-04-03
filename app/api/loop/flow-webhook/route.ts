import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * In-memory webhook event buffer.
 * Events are stored per webhook ID and expire after 5 minutes.
 * In production, this should be backed by Redis or a database table.
 */
const webhookBuffer = new Map<
  string,
  { body: string; headers: Record<string, string>; method: string; receivedAt: number }[]
>();

const MAX_EVENTS_PER_ID = 50;
const EVENT_TTL_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 256 * 1024; // 256KB max body size
const MAX_WEBHOOK_IDS = 1000; // Cap total tracked webhook IDs

function pruneExpired(id: string) {
  const events = webhookBuffer.get(id);
  if (!events) return;
  const now = Date.now();
  const live = events.filter((e) => now - e.receivedAt < EVENT_TTL_MS);
  if (live.length === 0) {
    webhookBuffer.delete(id);
  } else {
    webhookBuffer.set(id, live);
  }
}

/**
 * GET: Poll for pending webhook events by ID.
 * Used by the workflow engine's trigger node.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id || id.length > 128) {
    return NextResponse.json(
      { error: "Missing or invalid 'id' query parameter" },
      { status: 400 }
    );
  }

  pruneExpired(id);
  const events = webhookBuffer.get(id) ?? [];

  // Drain events after reading (one-shot consumption)
  webhookBuffer.delete(id);

  return NextResponse.json({ events });
}

/**
 * POST: Receive a webhook event and buffer it by ID.
 * External services send payloads here; the workflow engine polls via GET.
 * Requires a webhook secret in x-webhook-secret header if WEBHOOK_SECRET env var is set.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "WEBHOOK_SECRET not configured — refusing unauthenticated webhooks" }, { status: 503 });
  }
  const provided = request.headers.get("x-webhook-secret");
  if (provided !== webhookSecret) {
    return NextResponse.json({ error: "Invalid or missing webhook secret" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id || id.length > 128) {
    return NextResponse.json(
      { error: "Missing or invalid 'id' query parameter" },
      { status: 400 }
    );
  }

  // Check content-length before reading body
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Body too large (max ${MAX_BODY_BYTES} bytes)` },
      { status: 413 }
    );
  }

  // Prevent unbounded memory growth
  if (webhookBuffer.size >= MAX_WEBHOOK_IDS && !webhookBuffer.has(id)) {
    return NextResponse.json(
      { error: "Too many active webhook IDs" },
      { status: 429 }
    );
  }

  let body = "{}";
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: `Body too large (max ${MAX_BODY_BYTES} bytes)` },
        { status: 413 }
      );
    }
    body = raw || "{}";
  } catch {
    // Empty body is fine
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!key.startsWith("x-forwarded") && key !== "host" && key !== "connection") {
      headers[key] = value;
    }
  });

  pruneExpired(id);
  const events = webhookBuffer.get(id) ?? [];
  events.push({
    body,
    headers,
    method: request.method,
    receivedAt: Date.now(),
  });

  // Cap buffer size
  if (events.length > MAX_EVENTS_PER_ID) {
    events.splice(0, events.length - MAX_EVENTS_PER_ID);
  }

  webhookBuffer.set(id, events);

  return NextResponse.json({ ok: true, buffered: events.length });
}
