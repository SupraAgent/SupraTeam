import { NextResponse } from "next/server";

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
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Missing 'id' query parameter" },
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
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Missing 'id' query parameter" },
      { status: 400 }
    );
  }

  let body = "{}";
  try {
    body = await request.text();
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
