/**
 * Centralized audit logging for all sensitive CRM operations.
 */
import { createSupabaseAdmin } from "@/lib/supabase";

export async function logAudit(params: {
  action: string;
  entityType: string;
  entityId?: string;
  actorId: string;
  actorName?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return;

  await supabase.from("crm_audit_log").insert({
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    actor_id: params.actorId,
    actor_name: params.actorName ?? null,
    details: params.details ?? {},
  });
}
