/**
 * Telegram follow-up draft generation + bot notification.
 *
 * After AI extraction completes on a transcript:
 * 1. Stores a "suggested_followup" activity on the deal
 * 2. Sends a TG bot notification to the deal owner with summary + action items
 */
import { createSupabaseAdmin } from "@/lib/supabase";
import { sendTelegramWithTracking } from "@/lib/telegram-send";
import type { AIExtraction } from "./ai-extract";

/**
 * Generate and store a TG follow-up draft, then notify the deal owner via TG bot.
 */
export async function generateAndNotifyFollowUp(
  transcriptId: string,
  dealId: string,
  userId: string,
  extraction: AIExtraction,
  meetingTitle: string
): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  // Get deal details for the notification
  const { data: deal } = await admin
    .from("crm_deals")
    .select("deal_name, telegram_chat_id, stage:pipeline_stages(name)")
    .eq("id", dealId)
    .single();

  if (!deal) return;

  // Store the suggested follow-up as a deal activity
  if (extraction.suggested_followup?.message) {
    await admin.from("crm_deal_activities").insert({
      deal_id: dealId,
      user_id: userId,
      activity_type: "suggested_followup",
      title: `AI follow-up draft for: ${meetingTitle}`,
      metadata: {
        transcript_id: transcriptId,
        suggested_message: extraction.suggested_followup.message,
        urgency: extraction.suggested_followup.urgency,
        action_items: extraction.action_items,
        stage_recommendation: extraction.stage_recommendation,
      },
      reference_id: transcriptId,
      reference_type: "transcript",
    });
  }

  // Get user's TG chat ID for bot notification
  const { data: profile } = await admin
    .from("profiles")
    .select("telegram_user_id")
    .eq("id", userId)
    .single();

  if (!profile?.telegram_user_id) return;

  const actionItemsText = extraction.action_items?.length
    ? extraction.action_items
        .slice(0, 5)
        .map((a) => `  • ${a.text}${a.owner ? ` (${a.owner})` : ""}`)
        .join("\n")
    : "  No action items detected";

  const stageHint = extraction.stage_recommendation?.suggested_stage
    ? `\n📊 Stage suggestion: ${extraction.stage_recommendation.suggested_stage}`
    : "";

  const sentimentLine = extraction.sentiment_summary
    ? `\n💬 ${extraction.sentiment_summary}`
    : "";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
  const dealLink = `${appUrl}/pipeline?deal=${dealId}`;

  const notificationText = `📝 *Call transcript ready*
*${deal.deal_name}* — ${meetingTitle}

${extraction.deal_summary ?? "Summary not available"}

📋 *Action items:*
${actionItemsText}${stageHint}${sentimentLine}

[Open deal](${dealLink})`;

  await sendTelegramWithTracking({
    chatId: Number(profile.telegram_user_id),
    text: notificationText,
    notificationType: "transcript_ready",
    dealId,
    parseMode: "Markdown",
    isDirectMessage: true,
  });
}
