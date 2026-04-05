import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface SessionRow {
  id: string;
  user_id: string;
  display_name: string | null;
  is_active: boolean;
  phone_last4: string | null;
  telegram_user_id: number | null;
  connected_at: string;
  last_used_at: string;
  encryption_method: string;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * GET /api/telegram/sessions
 * List all team sessions (team visibility via RLS).
 * Returns sessions with profile info for the owning user.
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // RLS policy "Team can view all TG sessions" allows authenticated users to see all sessions
  const { data: sessions, error } = await supabase
    .from("tg_client_sessions")
    .select("id, user_id, display_name, is_active, phone_last4, telegram_user_id, connected_at, last_used_at, encryption_method")
    .order("connected_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch profile info for all unique user_ids
  const userIds = [...new Set((sessions ?? []).map((s: SessionRow) => s.user_id))];
  let profileMap: Record<string, ProfileRow> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);

    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map((p: ProfileRow) => [p.id, p])
      );
    }
  }

  const enriched = (sessions ?? []).map((s: SessionRow) => {
    const profile = profileMap[s.user_id];
    return {
      id: s.id,
      user_id: s.user_id,
      display_name: s.display_name,
      is_active: s.is_active,
      phone_last4: s.phone_last4,
      telegram_user_id: s.telegram_user_id,
      connected_at: s.connected_at,
      last_used_at: s.last_used_at,
      encryption_method: s.encryption_method,
      owner_name: profile?.display_name ?? null,
      owner_avatar: profile?.avatar_url ?? null,
    };
  });

  return NextResponse.json({ sessions: enriched });
}

/**
 * POST /api/telegram/sessions
 * Register a new Telegram session for the current user.
 * Unlike the legacy flow, does not enforce uniqueness on user_id.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    sessionEncrypted,
    phoneLast4,
    telegramUserId,
    displayName,
    dcId,
    encryptionMethod,
  } = body as {
    sessionEncrypted?: string;
    phoneLast4?: string;
    telegramUserId?: number;
    displayName?: string;
    dcId?: number;
    encryptionMethod?: string;
  };

  if (!sessionEncrypted) {
    return NextResponse.json(
      { error: "sessionEncrypted is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("tg_client_sessions")
    .insert({
      user_id: user.id,
      session_encrypted: sessionEncrypted,
      phone_number_hash: null,
      phone_last4: phoneLast4 ?? null,
      telegram_user_id: telegramUserId ?? null,
      display_name: displayName?.trim() || null,
      is_active: true,
      dc_id: dcId ?? null,
      encryption_method: encryptionMethod ?? "client",
      connected_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    })
    .select("id, user_id, display_name, is_active, phone_last4, telegram_user_id, connected_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: data, ok: true });
}
