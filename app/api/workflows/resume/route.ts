import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { resumeWorkflowRun } from "@/lib/workflow-engine";

/**
 * Process due workflow resume messages from crm_scheduled_messages.
 * Called by cron (poll-notifications) or manually.
 * Picks up scheduled messages with tg_chat_id=0 and _workflow_resume payload.
 */
export async function POST(request: Request) {
  // Allow cron auth or internal calls
  const { verifyCron } = await import("@/lib/cron-auth");
  const cronErr = verifyCron(request);
  // Also allow authenticated users
  if (cronErr) {
    const { requireAuth } = await import("@/lib/auth-guard");
    const auth = await requireAuth();
    if ("error" in auth) return cronErr; // Neither cron nor authenticated
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // Find workflow resume messages that are due
  const { data: due } = await supabase
    .from("crm_scheduled_messages")
    .select("id, message_text")
    .eq("status", "pending")
    .eq("tg_chat_id", 0)
    .lte("send_at", new Date().toISOString())
    .order("send_at")
    .limit(10);

  let resumed = 0;
  let failed = 0;

  for (const msg of due ?? []) {
    try {
      const payload = JSON.parse(msg.message_text);
      if (!payload._workflow_resume || !payload.run_id) continue;

      const result = await resumeWorkflowRun(payload.run_id);

      // Mark the scheduled message as processed
      await supabase
        .from("crm_scheduled_messages")
        .update({
          status: result.status === "failed" ? "failed" : "sent",
          sent_at: new Date().toISOString(),
          last_error: result.error ?? null,
        })
        .eq("id", msg.id);

      if (result.status !== "failed") {
        resumed++;
      } else {
        failed++;
      }
    } catch (err) {
      // Not a workflow resume message or parse error — skip
      failed++;
    }
  }

  return NextResponse.json({ resumed, failed, checked: due?.length ?? 0 });
}
