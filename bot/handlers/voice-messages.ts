import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

/**
 * Rate limiter: max 10 transcriptions per minute per user.
 */
const userTranscriptionCounts = new Map<number, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(userId: number): boolean {
  const now = Date.now();
  const entry = userTranscriptionCounts.get(userId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    userTranscriptionCounts.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

/** Max file size: 20MB */
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Download a file from Telegram Bot API by file_id.
 */
async function downloadTelegramFile(bot: Bot, fileId: string): Promise<Buffer> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error("No file_path returned from getFile");

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`File download failed: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Process a voice transcription: transcribe, extract action items, analyze sentiment.
 * Updates the DB record throughout the process.
 */
async function processVoiceTranscription(
  bot: Bot,
  transcriptionId: string,
  fileId: string,
  chatId: number,
  linkedDealId: string | null
): Promise<void> {
  try {
    // Mark as processing
    await supabase
      .from("crm_voice_transcriptions")
      .update({ transcription_status: "processing", updated_at: new Date().toISOString() })
      .eq("id", transcriptionId);

    // Download file
    const fileBuffer = await downloadTelegramFile(bot, fileId);

    // Dynamic import to avoid bundling AI libs in the bot process at module load
    const {
      transcribeVoiceMessage,
      extractActionItems,
      analyzeSentiment,
      generateSummary,
    } = await import("../../lib/voice-transcription");

    // Transcribe
    const result = await transcribeVoiceMessage(fileBuffer);

    if (!result.text) {
      await supabase
        .from("crm_voice_transcriptions")
        .update({
          transcription_status: "failed",
          error_message: "No speech detected in audio",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transcriptionId);
      return;
    }

    // Run analysis in parallel
    const [actionItems, sentimentResult, summary] = await Promise.all([
      extractActionItems(result.text),
      analyzeSentiment(result.text),
      generateSummary(result.text),
    ]);

    // Update record with full results
    await supabase
      .from("crm_voice_transcriptions")
      .update({
        transcription_text: result.text,
        transcription_status: "completed",
        language: result.language,
        confidence_score: result.confidence,
        action_items: actionItems,
        sentiment: sentimentResult.sentiment,
        summary,
        transcribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", transcriptionId);

    // If action items found and deal is linked, fire workflow trigger
    if (actionItems.length > 0 && linkedDealId) {
      try {
        const [{ triggerWorkflowsByEvent }, { triggerLoopWorkflowsByEvent }] = await Promise.all([
          import("../../lib/workflow-engine"),
          import("../../lib/loop-workflow-engine"),
        ]);
        await Promise.allSettled([
          triggerWorkflowsByEvent("voice_action_items", {
            transcription_id: transcriptionId,
            deal_id: linkedDealId,
            action_items: actionItems,
            chat_id: String(chatId),
            summary,
          }),
          triggerLoopWorkflowsByEvent("voice_action_items", {
            transcription_id: transcriptionId,
            deal_id: linkedDealId,
            action_items: actionItems,
            chat_id: String(chatId),
            summary,
          }),
        ]);
      } catch (err) {
        console.error("[bot/voice] workflow trigger error:", err);
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown transcription error";
    console.error("[bot/voice] transcription error:", errorMessage);
    await supabase
      .from("crm_voice_transcriptions")
      .update({
        transcription_status: "failed",
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transcriptionId);
  }
}

export function registerVoiceHandlers(bot: Bot): void {
  // Handle voice messages (voice notes recorded in-app)
  bot.on("message:voice", async (ctx) => {
    const voice = ctx.message.voice;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;
    const senderId = ctx.from.id;

    // Rate limit check
    if (isRateLimited(senderId)) {
      console.warn(`[bot/voice] Rate limited user ${senderId}`);
      return;
    }

    // File size check
    if (voice.file_size && voice.file_size > MAX_FILE_SIZE_BYTES) {
      console.warn(`[bot/voice] File too large: ${voice.file_size} bytes from user ${senderId}`);
      return;
    }

    // Find if this chat is linked to a deal
    let linkedDealId: string | null = null;
    let linkedContactId: string | null = null;

    const { data: deal } = await supabase
      .from("crm_deals")
      .select("id")
      .eq("telegram_chat_id", chatId)
      .eq("outcome", "open")
      .limit(1)
      .single();

    if (deal) linkedDealId = deal.id;

    // Try to find contact by telegram_user_id
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("telegram_user_id", senderId)
      .limit(1)
      .single();

    if (contact) linkedContactId = contact.id;

    // Resolve the CRM user_id for the sender (if they are a team member)
    let userId: string | null = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_id", senderId)
      .limit(1)
      .single();

    if (profile) userId = profile.id;

    // Create pending transcription record
    const { data: transcription, error } = await supabase
      .from("crm_voice_transcriptions")
      .insert({
        user_id: userId,
        chat_id: chatId,
        message_id: messageId,
        telegram_file_id: voice.file_id,
        duration_seconds: voice.duration ?? null,
        file_size_bytes: voice.file_size ?? null,
        transcription_status: "pending",
        linked_deal_id: linkedDealId,
        linked_contact_id: linkedContactId,
      })
      .select("id")
      .single();

    if (error || !transcription) {
      console.error("[bot/voice] insert error:", error);
      return;
    }

    // Process transcription asynchronously (non-blocking)
    processVoiceTranscription(bot, transcription.id, voice.file_id, chatId, linkedDealId).catch(
      (err) => console.error("[bot/voice] async processing error:", err)
    );
  });

  // Handle video notes (round video messages — treated the same way)
  bot.on("message:video_note", async (ctx) => {
    const videoNote = ctx.message.video_note;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;
    const senderId = ctx.from.id;

    if (isRateLimited(senderId)) return;
    if (videoNote.file_size && videoNote.file_size > MAX_FILE_SIZE_BYTES) return;

    let linkedDealId: string | null = null;
    let linkedContactId: string | null = null;

    const { data: deal } = await supabase
      .from("crm_deals")
      .select("id")
      .eq("telegram_chat_id", chatId)
      .eq("outcome", "open")
      .limit(1)
      .single();

    if (deal) linkedDealId = deal.id;

    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("telegram_user_id", senderId)
      .limit(1)
      .single();

    if (contact) linkedContactId = contact.id;

    let userId: string | null = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_id", senderId)
      .limit(1)
      .single();

    if (profile) userId = profile.id;

    const { data: transcription, error } = await supabase
      .from("crm_voice_transcriptions")
      .insert({
        user_id: userId,
        chat_id: chatId,
        message_id: messageId,
        telegram_file_id: videoNote.file_id,
        duration_seconds: videoNote.duration ?? null,
        file_size_bytes: videoNote.file_size ?? null,
        transcription_status: "pending",
        linked_deal_id: linkedDealId,
        linked_contact_id: linkedContactId,
      })
      .select("id")
      .single();

    if (error || !transcription) {
      console.error("[bot/voice] video_note insert error:", error);
      return;
    }

    processVoiceTranscription(bot, transcription.id, videoNote.file_id, chatId, linkedDealId).catch(
      (err) => console.error("[bot/voice] video_note async error:", err)
    );
  });
}
