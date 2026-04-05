"use client";

import { TelegramBrowserService } from "@/lib/client/telegram-service";
import type { TgUserProfile } from "@/lib/client/telegram-service";

/**
 * Data extracted from a Telegram user profile via GramJS (browser-side).
 */
export interface TelegramEnrichmentData {
  bio: string | null;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
}

/**
 * Fetch a Telegram user's profile using the browser-side GramJS client.
 *
 * This runs entirely client-side (zero-knowledge) — the server never
 * sees the Telegram session or API data.
 *
 * @param telegramUserId - The numeric Telegram user ID
 * @returns Extracted profile data, or null if the service is not connected
 */
export async function scrapeTelegramBio(
  telegramUserId: number
): Promise<TelegramEnrichmentData | null> {
  const service = TelegramBrowserService.getInstance();

  if (!service.connected) {
    return null;
  }

  let profile: TgUserProfile;
  try {
    profile = await service.getUserProfile(telegramUserId);
  } catch (err) {
    console.error("[telegram-bio] Failed to fetch profile for user", telegramUserId, err);
    return null;
  }

  return {
    bio: profile.bio ?? null,
    username: profile.username ?? null,
    firstName: profile.firstName,
    lastName: profile.lastName ?? null,
    photoUrl: profile.photoUrl,
  };
}
