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
  // Fire-and-forget — use void to not block the response
  void admin.from("crm_email_audit_log").insert({
    user_id: params.userId,
    action: params.action,
    thread_id: params.threadId ?? null,
    recipient: params.recipient ?? null,
    metadata: {
      ...params.metadata,
      ...(params.bulkId ? { bulk_id: params.bulkId } : {}),
    },
  });
}
