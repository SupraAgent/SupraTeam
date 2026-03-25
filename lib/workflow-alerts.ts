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
 * Called from the persistence layer's updateRun.
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
    case "in_app": {
      // Insert into notifications table — workflow_alert type, no user_id needed
      // (crm_notifications doesn't have a user_id column; all users see workflow alerts)
      const { error: insertErr } = await supabase.from("crm_notifications").insert({
        type: "workflow_alert",
        title: `Workflow Alert: ${workflowName}`,
        body: message,
        metadata: { workflow_id: alert.workflow_id, alert_id: alert.id, alert_type: alert.alert_type },
      });
      if (insertErr) {
        console.error("[workflow-alerts] Failed to insert in_app notification:", insertErr.message);
      }
      break;
    }

    case "telegram": {
      const chatId = alert.config.chat_id as string | number | undefined;
      if (!chatId) break;

      const numericChatId = typeof chatId === "string" ? parseInt(chatId, 10) : chatId;
      if (isNaN(numericChatId)) {
        console.error("[workflow-alerts] Invalid telegram chat_id:", chatId);
        break;
      }

      // Use the first active bot to send the alert
      const { data: bots } = await supabase
        .from("crm_bots")
        .select("id")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1);

      if (bots && bots.length > 0) {
        await supabase.from("crm_scheduled_messages").insert({
          deal_id: null,
          bot_id: bots[0].id,
          tg_chat_id: numericChatId,
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

      // Use the workflow creator's slack token if available, otherwise fall back to any token
      const { data: workflow } = await supabase
        .from("crm_workflows")
        .select("created_by")
        .eq("id", alert.workflow_id)
        .single();

      let tokenQuery = supabase
        .from("user_tokens")
        .select("token_encrypted")
        .eq("provider", "slack")
        .limit(1);

      if (workflow?.created_by) {
        tokenQuery = tokenQuery.eq("user_id", workflow.created_by);
      }

      const { data: slackToken } = await tokenQuery.single();
      if (!slackToken) {
        // If no token for the creator, try any slack token
        if (workflow?.created_by) {
          const { data: fallback } = await supabase
            .from("user_tokens")
            .select("token_encrypted")
            .eq("provider", "slack")
            .limit(1)
            .single();
          if (!fallback) break;
          await sendSlackMessage(fallback.token_encrypted, channelId, message);
        }
        break;
      }

      await sendSlackMessage(slackToken.token_encrypted, channelId, message);
      break;
    }
  }
}

async function sendSlackMessage(tokenEncrypted: string, channelId: string, message: string): Promise<void> {
  try {
    const { decryptToken } = await import("@/lib/crypto");
    const token = decryptToken(tokenEncrypted);
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: channelId, text: message }),
    });
  } catch (err) {
    console.error("[workflow-alerts] Slack send failed:", (err as Error).message);
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
