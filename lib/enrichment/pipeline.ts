"use client";

import type { Contact } from "@/lib/types";
import { scrapeTelegramBio } from "./telegram-bio";
import type { TelegramEnrichmentData } from "./telegram-bio";

/**
 * Results from the enrichment pipeline for a single contact.
 */
export interface EnrichmentResult {
  contactId: string;
  /** Whether X enrichment was triggered (fire-and-forget server call). */
  xTriggered: boolean;
  /** Telegram profile data scraped client-side, or null if unavailable. */
  telegramData: TelegramEnrichmentData | null;
  /** Any errors encountered during enrichment. */
  errors: string[];
}

/**
 * Determines whether X enrichment should run for a contact.
 */
function shouldEnrichX(contact: Contact): boolean {
  if (!contact.x_handle) return false;
  if (!contact.enriched_at) return true;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return new Date(contact.enriched_at).getTime() < sevenDaysAgo;
}

/**
 * Orchestrate enrichment for a single contact.
 *
 * - X enrichment: triggered server-side if `x_handle` is set and data is stale (>7 days).
 * - Telegram enrichment: scraped client-side via GramJS if `telegram_user_id` is set.
 *   Returns the data for the caller to POST to the server.
 *
 * @param contact - The contact to enrich (must include id, x_handle, telegram_user_id, enriched_at)
 * @returns Enrichment results including any TG data the caller should POST
 */
export async function enrichContact(contact: Contact): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    contactId: contact.id,
    xTriggered: false,
    telegramData: null,
    errors: [],
  };

  // Run X and TG enrichment in parallel
  const promises: Promise<void>[] = [];

  // X enrichment (server-side, fire-and-forget)
  if (shouldEnrichX(contact)) {
    promises.push(
      fetch("/api/contacts/enrich-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id }),
      })
        .then((res) => {
          result.xTriggered = true;
          if (!res.ok) {
            result.errors.push(`X enrichment failed (${res.status})`);
          }
        })
        .catch((err: Error) => {
          result.errors.push(`X enrichment error: ${err.message}`);
        })
    );
  }

  // Telegram enrichment (client-side via GramJS)
  if (contact.telegram_user_id) {
    promises.push(
      scrapeTelegramBio(contact.telegram_user_id)
        .then(async (data) => {
          result.telegramData = data;
          // If we got data, POST it to the server to persist
          if (data) {
            try {
              const res = await fetch("/api/contacts/enrich-telegram", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contact_id: contact.id,
                  bio: data.bio,
                  username: data.username,
                  photo_url: data.photoUrl,
                }),
              });
              if (!res.ok) {
                result.errors.push(`TG enrichment save failed (${res.status})`);
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : "Unknown error";
              result.errors.push(`TG enrichment save error: ${message}`);
            }
          }
        })
        .catch((err: Error) => {
          result.errors.push(`TG enrichment error: ${err.message}`);
        })
    );
  }

  await Promise.allSettled(promises);

  return result;
}
