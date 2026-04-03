/**
 * Shared in-memory stores for Telegram login flows.
 *
 * Extracted into a standalone module so that both the "send code" route
 * and the "verify code" route import the SAME Map instance, instead of
 * one route importing from the other's route.ts (which can break when
 * Next.js bundles route handlers into separate chunks or workers).
 *
 * Note: These Maps live in Node.js process memory. They work correctly
 * in `next dev` and single-process production, but will NOT survive
 * serverless cold starts. For serverless deployments, replace with
 * Redis or a short-TTL database table.
 */

import type { TelegramClient } from "telegram";
import { createHmac, createHash } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase";

// ── Phone login pending sessions ──

export type PendingPhoneLogin = {
  client: TelegramClient;
  phoneHash: string;
  phoneCodeHash: string;
  expiresAt: number;
};

export const pendingPhoneLogins = new Map<string, PendingPhoneLogin>();

// ── QR auth login pending sessions (unauthenticated /api/auth/telegram-qr) ──

export type PendingQRLogin = {
  client: TelegramClient;
  expiresAt: number;
  confirmed: boolean;
  tgUser?: { id: number; firstName: string; lastName?: string; username?: string };
};

export const pendingQRLogins = new Map<string, PendingQRLogin>();

// ── QR connect sessions (authenticated /api/telegram-client/qr-login) ──

export type PendingQRConnect = {
  client: TelegramClient;
  expiresAt: number;
  confirmed: boolean;
  tgUser?: { id: number; firstName: string; lastName?: string; username?: string };
};

export const pendingQRConnects = new Map<string, PendingQRConnect>();

// ── Cleanup all stores every 60s ──

function cleanupMap<T extends { expiresAt: number; client: TelegramClient }>(
  map: Map<string, T>
) {
  const now = Date.now();
  for (const [key, entry] of map) {
    if (now > entry.expiresAt) {
      entry.client.disconnect().catch(() => {});
      map.delete(key);
    }
  }
}

setInterval(() => {
  cleanupMap(pendingPhoneLogins);
  cleanupMap(pendingQRLogins);
  cleanupMap(pendingQRConnects);
}, 60_000);

// ── Shared helper: create or sign-in a Supabase user from TG identity ──

export async function getOrCreateSupabaseSession(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  tgUser: {
    id: number | bigint;
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
  }
) {
  const tgId = Number(tgUser.id);
  const email = `tg_${tgId}@supracrm.tg`;
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.error("[telegram-login-store] TOKEN_ENCRYPTION_KEY is not set — cannot derive password");
    return null;
  }
  const password = createHmac("sha256", encryptionKey).update(`tg_user_${tgId}`).digest("hex");
  const displayName =
    [tgUser.firstName, tgUser.lastName].filter(Boolean).join(" ") ||
    `User ${tgId}`;

  const userMetadata = {
    telegram_id: tgId,
    telegram_username: tgUser.username ?? null,
    display_name: displayName,
    avatar_url: null,
  };

  // Try sign in first
  const { data: signInResult, error: signInError } =
    await admin.auth.signInWithPassword({ email, password });

  let session = signInResult?.session;

  if (signInError) {
    // Create new user
    const { data: newUser, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });

    if (createError) {
      console.error("[telegram-login-store] create user error:", createError);
      return null;
    }

    const { data: newSignIn, error: newSignInError } =
      await admin.auth.signInWithPassword({ email, password });

    if (newSignInError || !newSignIn.session) {
      console.error(
        "[telegram-login-store] sign in after create error:",
        newSignInError
      );
      return null;
    }

    session = newSignIn.session;

    await admin.from("profiles").upsert(
      {
        id: newUser.user.id,
        display_name: displayName,
        avatar_url: null,
        telegram_id: tgId,
      },
      { onConflict: "id" }
    );
  } else if (signInResult.user) {
    await admin.auth.admin.updateUserById(signInResult.user.id, {
      user_metadata: userMetadata,
    });

    await admin.from("profiles").upsert(
      {
        id: signInResult.user.id,
        display_name: displayName,
        avatar_url: null,
        telegram_id: tgId,
      },
      { onConflict: "id" }
    );
  }

  return session;
}

/** SHA-256 hash of stripped phone digits — used as map key so plaintext phone is never stored */
export function phoneKey(phone: string): string {
  const stripped = phone.replace(/\D/g, "");
  return createHash("sha256").update(stripped).digest("hex");
}
