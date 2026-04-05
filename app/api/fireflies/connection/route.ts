import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase";
import { decryptWebhookSecret } from "@/lib/fireflies/client";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data: conn } = await admin
    .from("crm_fireflies_connections")
    .select("id, fireflies_email, webhook_secret_encrypted, is_active, connected_at, updated_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!conn) {
    return NextResponse.json({ data: null, source: "fireflies" });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";

  return NextResponse.json({
    data: {
      id: conn.id,
      email: conn.fireflies_email,
      is_active: conn.is_active,
      connected_at: conn.connected_at,
      webhook_url: `${appUrl}/api/webhooks/fireflies?uid=${user.id}`,
      webhook_secret: decryptWebhookSecret(conn.webhook_secret_encrypted) ?? "",
    },
    source: "fireflies",
  });
}

export async function DELETE() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const rl = rateLimit(`fireflies-disconnect:${user.id}`, { max: 3, windowSec: 60 });
  if (rl) return rl;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  await admin
    .from("crm_fireflies_connections")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  return NextResponse.json({ data: { disconnected: true }, source: "fireflies" });
}
