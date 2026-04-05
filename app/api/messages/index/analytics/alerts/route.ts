/**
 * GET /api/messages/index/analytics/alerts — List alert thresholds
 * POST /api/messages/index/analytics/alerts — Create/update an alert threshold
 * DELETE /api/messages/index/analytics/alerts?id=xxx — Delete an alert
 *
 * Alert thresholds trigger webhooks when a metric crosses a boundary.
 * Evaluated by a cron job or on-demand via the check endpoint.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { data, error } = await supabase
    .from("crm_analytics_alerts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, metric, chat_id, threshold_type, threshold_value, webhook_url, is_active } = body as {
    id?: string;
    metric: string;
    chat_id?: number;
    threshold_type: "above" | "below";
    threshold_value: number;
    webhook_url?: string;
    is_active?: boolean;
  };

  if (!metric || !threshold_type || threshold_value === undefined) {
    return NextResponse.json(
      { error: "metric, threshold_type, and threshold_value required" },
      { status: 400 }
    );
  }

  const alertData = {
    user_id: user.id,
    metric,
    chat_id: chat_id ?? null,
    threshold_type,
    threshold_value,
    webhook_url: webhook_url ?? null,
    is_active: is_active ?? true,
  };

  if (id) {
    // Update existing
    const { error } = await supabase
      .from("crm_analytics_alerts")
      .update(alertData)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id });
  }

  // Create new
  const { data, error } = await supabase
    .from("crm_analytics_alerts")
    .insert(alertData)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_analytics_alerts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
