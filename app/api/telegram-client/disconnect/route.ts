/**
 * POST /api/telegram-client/disconnect
 * Disconnect user's Telegram client session and delete stored session
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { disconnectClient } from "@/lib/telegram-client";

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  try {
    // Disconnect in-memory client
    await disconnectClient(user.id);

    // Delete session from DB
    await admin.from("tg_client_sessions").delete().eq("user_id", user.id);

    // Optionally delete private contacts (user choice -- for now keep them)
    // To fully purge: await admin.from("tg_private_contacts").delete().eq("user_id", user.id);

    // Audit log
    await admin.from("tg_client_audit_log").insert({
      user_id: user.id,
      action: "disconnect",
      target_type: "user",
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Disconnect failed";
    console.error("[tg-client/disconnect]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
