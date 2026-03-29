import type { SupabaseClient } from "@supabase/supabase-js";

export function logEmailAction(
  admin: SupabaseClient,
  params: {
    userId: string;
    action: string;
    threadId?: string;
    recipient?: string;
    metadata?: Record<string, unknown>;
    bulkId?: string;
  }
): void {
  // Fire-and-forget — don't block the response but log failures
  admin.from("crm_email_audit_log").insert({
    user_id: params.userId,
    action: params.action,
    thread_id: params.threadId ?? null,
    recipient: params.recipient ?? null,
    metadata: {
      ...params.metadata,
      ...(params.bulkId ? { bulk_id: params.bulkId } : {}),
    },
  }).then(({ error }) => {
    if (error) console.error("[audit] failed to log:", error.message);
  });
}
