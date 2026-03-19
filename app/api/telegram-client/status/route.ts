/**
 * GET /api/telegram-client/status
 * Check if user has an active Telegram client connection
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  const { data: session } = await admin
    .from("tg_client_sessions")
    .select("telegram_user_id, phone_last4, is_active, connected_at, last_used_at")
    .eq("user_id", user.id)
    .single();

  if (!session || !session.is_active) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    telegramUserId: session.telegram_user_id,
    phoneLast4: session.phone_last4,
    connectedAt: session.connected_at,
    lastUsedAt: session.last_used_at,
  });
}
