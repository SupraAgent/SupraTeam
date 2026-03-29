import type { SupabaseClient } from "@supabase/supabase-js";

interface EnrichmentLogParams {
  contact_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  source: string;
  created_by?: string;
}

/**
 * Log an enrichment change to crm_enrichment_log.
 * Fire-and-forget — errors are swallowed so callers are never blocked.
 */
export async function logEnrichment(
  supabase: SupabaseClient,
  params: EnrichmentLogParams
): Promise<void> {
  supabase
    .from("crm_enrichment_log")
    .insert({
      contact_id: params.contact_id,
      field_name: params.field_name,
      old_value: params.old_value,
      new_value: params.new_value,
      source: params.source,
      created_by: params.created_by ?? null,
    })
    .then(
      ({ error }) => {
        if (error) console.error("[enrichment-log] Insert failed:", error.message);
      },
      (err: unknown) => {
        console.error("[enrichment-log] Failed to log enrichment:", err);
      }
    );
}
