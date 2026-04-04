import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getCalendlyEventTypes } from "@/lib/calendly/client";

/** GET: List user's Calendly event types (cached) */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const eventTypes = await getCalendlyEventTypes(auth.user.id);
    return NextResponse.json({ data: eventTypes, source: "calendly" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch event types";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
