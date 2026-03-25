/**
 * Workflow alert processing — checks alert rules after workflow runs
 * and sends notifications via configured channels.
 */
import { createSupabaseAdmin } from "@/lib/supabase";

interface AlertRule {
  id: string;
  workflow_id: string;
  alert_type: string;
  channel: string;
  config: Record<string, unknown>;
  is_active: boolean;
}

/**
 * Check and fire alerts after a workflow run completes.
 * Called from the persistence layer's onWorkflowComplete/updateRun.
 */
export async function checkWorkflowAlerts(
  workflowId: string,
  runStatus: string,
  runDurationMs: number | null,
  error: string | null
): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return;

  const { data: alerts } = await supabase
    .from("crm_workflow_alerts")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("is_active", true);

  if (!alerts || alerts.length === 0) return;

  const { data: workflow } = await supabase
    .from("crm_workflows")
    .select("name")
    .eq("id", workflowId)
    .single();

  const workflowName = workflow?.name ?? "Unknown workflow";

  for (const alert of alerts as AlertRule[]) {
    const shouldFire = await shouldFireAlert(supabase, alert, runStatus, runDurationMs);
    if (shouldFire) {
      await sendAlert(supabase, alert, workflowName, runStatus, runDurationMs, error);
    }
  }
}

async function shouldFireAlert(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  alert: AlertRule,
  runStatus: string,
  durationMs: number | null
): Promise<boolean> {
  switch (alert.alert_type) {
    case "failure":
      return runStatus === "failed";

    case "slow_run": {
      const thresholdMs = (alert.config.threshold_ms as number) ?? 30000;
      return runStatus === "completed" && durationMs !== null && durationMs > thresholdMs;
    }

    case "consecutive_failures": {
      const requiredCount = (alert.config.consecutive_count as number) ?? 3;
      if (runStatus !== "failed") return false;

      // Check last N runs for this workflow
      const { data: recentRuns } = await supabase
        .from("crm_workflow_runs")
        .select("status")
        .eq("workflow_id", alert.workflow_id)
        .order("started_at", { ascending: false })
        .limit(requiredCount);

      if (!recentRuns || recentRuns.length < requiredCount) return false;
      return recentRuns.every((r) => r.status === "failed");
    }

    default:
      return false;
  }
}

async function sendAlert(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  alert: AlertRule,
  workflowName: string,
  runStatus: string,
  durationMs: number | null,
  error: string | null
): Promise<void> {
  const message = formatAlertMessage(alert, workflowName, runStatus, durationMs, error);

  switch (alert.channel) {
    case "in_app":
      // Insert into notifications table (visible in app notification center)
      await supabase.from("crm_notifications").insert({
        type: "workflow_alert",
        title: `Workflow Alert: ${workflowName}`,
        body: message,
        metadata: { workflow_id: alert.workflow_id, alert_id: alert.id, alert_type: alert.alert_type },
      }).then(() => {});
      break;

    case "telegram": {
      const chatId = alert.config.chat_id as string | number | undefined;
      if (!chatId) break;
      // Use the first available bot to send the alert
      const { data: bots } = await supabase
        .from("crm_bots")
        .select("id")
        .limit(1);
      if (bots && bots.length > 0) {
        await supabase.from("crm_scheduled_messages").insert({
          deal_id: null,
          tg_chat_id: typeof chatId === "string" ? parseInt(chatId) : chatId,
          message_text: message,
          send_at: new Date().toISOString(),
          status: "pending",
        });
      }
      break;
    }

    case "slack": {
      const channelId = alert.config.channel_id as string | undefined;
      if (!channelId) break;
      // Queue slack message via the existing slack integration
      const { data: slackToken } = await supabase
        .from("user_tokens")
        .select("token_encrypted")
        .eq("provider", "slack")
        .limit(1)
        .single();
      if (slackToken) {
        // Fire-and-forget Slack post (best effort)
        try {
          const { decryptToken } = await import("@/lib/crypto");
          const token = decryptToken(slackToken.token_encrypted);
          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: channelId, text: message }),
          });
        } catch {
          // Best effort — don't fail the workflow
        }
      }
      break;
    }
  }
}

function formatAlertMessage(
  alert: AlertRule,
  workflowName: string,
  runStatus: string,
  durationMs: number | null,
  error: string | null
): string {
  const duration = durationMs != null
    ? durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`
    : "unknown";

  switch (alert.alert_type) {
    case "failure":
      return `Workflow "${workflowName}" failed.\nError: ${error ?? "Unknown"}\nDuration: ${duration}`;
    case "slow_run":
      return `Workflow "${workflowName}" completed slowly (${duration}).\nThreshold: ${(alert.config.threshold_ms as number ?? 30000) / 1000}s`;
    case "consecutive_failures":
      return `Workflow "${workflowName}" has failed ${alert.config.consecutive_count ?? 3} times in a row.\nLatest error: ${error ?? "Unknown"}`;
    default:
      return `Workflow alert for "${workflowName}": ${runStatus}`;
  }
}
