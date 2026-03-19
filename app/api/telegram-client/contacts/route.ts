/**
 * GET /api/telegram-client/contacts
 * List user's private Telegram contacts (from DB cache)
 *
 * POST /api/telegram-client/contacts
 * Import contacts from Telegram (fetches live, stores encrypted per-user)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getConnectedClient, getContacts, hashPhone, phoneLast4 } from "@/lib/telegram-client";
import { Api } from "telegram";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  let query = admin
    .from("tg_private_contacts")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .eq("is_deleted", false)
    .order("first_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,username.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[tg-client/contacts] list error:", error);
    return NextResponse.json({ error: "Failed to list contacts" }, { status: 500 });
  }

  return NextResponse.json({ data: data || [], count: count || 0, source: "db" });
}

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  // Get user's encrypted session
  const { data: session } = await admin
    .from("tg_client_sessions")
    .select("session_encrypted")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: "Telegram not connected. Connect first in Settings." },
      { status: 400 }
    );
  }

  try {
    const client = await getConnectedClient(user.id, session.session_encrypted);
    const result = await getContacts(client);

    if (result instanceof Api.contacts.ContactsNotModified) {
      return NextResponse.json({ ok: true, imported: 0, message: "Contacts already up to date" });
    }

    const contacts = result as Api.contacts.Contacts;
    const users = contacts.users.filter(
      (u): u is Api.User => u instanceof Api.User && !u.bot && !u.deleted
    );

    // Batch upsert contacts
    const rows = users.map((u) => ({
      user_id: user.id,
      telegram_user_id: Number(u.id),
      first_name: u.firstName || null,
      last_name: u.lastName || null,
      username: u.username || null,
      phone_hash: u.phone ? hashPhone(u.phone) : null,
      phone_last4: u.phone ? phoneLast4(u.phone) : null,
      is_mutual: u.mutualContact || false,
      is_deleted: false,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      // Upsert in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error: upsertError } = await admin
          .from("tg_private_contacts")
          .upsert(batch, { onConflict: "user_id,telegram_user_id" });

        if (upsertError) {
          console.error("[tg-client/contacts] upsert batch error:", upsertError);
        }
      }
    }

    // Update last_used_at
    await admin
      .from("tg_client_sessions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", user.id);

    // Audit log
    await admin.from("tg_client_audit_log").insert({
      user_id: user.id,
      action: "import_contacts",
      metadata: { count: rows.length },
    });

    return NextResponse.json({ ok: true, imported: rows.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("[tg-client/contacts] import error:", message);

    if (message.includes("AUTH_KEY_UNREGISTERED") || message.includes("SESSION_REVOKED")) {
      // Session expired -- mark inactive
      await admin
        .from("tg_client_sessions")
        .update({ is_active: false })
        .eq("user_id", user.id);
      return NextResponse.json(
        { error: "Telegram session expired. Please reconnect." },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
