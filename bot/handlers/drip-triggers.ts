/**
 * Drip Sequence Trigger Handler
 * Listens for TG events and auto-enrolls users into active drip sequences.
 *
 * Trigger types:
 * - group_join: User joins a TG group where bot is admin
 * - first_message: User sends first message in a group
 * - keyword_match: Message contains a keyword from trigger_config.keywords
 *
 * Note: silence_48h and engagement_drop are cron-based, not event-based.
 * They're handled by a separate cron job (not this handler).
 */

import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

interface DripSequence {
  id: string;
  name: string;
  trigger_event: string;
  trigger_config: {
    group_ids?: number[];
    keywords?: string[];
    threshold?: number;
  };
  status: string;
  board_type: string | null;
}

// Cache active drip sequences (refreshed every 60s)
let cachedSequences: DripSequence[] = [];
let cacheRefreshedAt = 0;
const CACHE_TTL_MS = 60_000;

async function getActiveSequences(): Promise<DripSequence[]> {
  if (cachedSequences.length > 0 && Date.now() - cacheRefreshedAt < CACHE_TTL_MS) {
    return cachedSequences;
  }
  const { data } = await supabase
    .from("crm_drip_sequences")
    .select("id, name, trigger_event, trigger_config, status, board_type")
    .eq("status", "active");
  cachedSequences = (data ?? []) as DripSequence[];
  cacheRefreshedAt = Date.now();
  return cachedSequences;
}

/**
 * Check if user is already enrolled in a sequence (active or completed recently).
 * Prevents duplicate enrollments.
 */
async function isAlreadyEnrolled(sequenceId: string, tgUserId: number): Promise<boolean> {
  const { count } = await supabase
    .from("crm_drip_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("sequence_id", sequenceId)
    .eq("tg_user_id", tgUserId)
    .in("status", ["active", "paused"]);
  return (count ?? 0) > 0;
}

/**
 * Enroll a user into a drip sequence.
 */
async function enrollUser(
  sequenceId: string,
  tgUserId: number,
  tgChatId: number,
  triggerEvent: string,
  triggerData: Record<string, unknown>
): Promise<void> {
  // Find contact by telegram_user_id (optional link)
  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("id")
    .eq("telegram_user_id", tgUserId)
    .limit(1)
    .single();

  // Find deal linked to this chat (optional link)
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("id")
    .eq("telegram_chat_id", tgChatId)
    .eq("outcome", "open")
    .limit(1)
    .single();

  // Get first step's delay
  const { data: firstStep } = await supabase
    .from("crm_drip_steps")
    .select("delay_hours")
    .eq("sequence_id", sequenceId)
    .eq("step_number", 1)
    .single();

  const delayHours = (firstStep?.delay_hours as number) ?? 0;

  const { error } = await supabase.from("crm_drip_enrollments").insert({
    sequence_id: sequenceId,
    tg_user_id: tgUserId,
    tg_chat_id: tgChatId,
    contact_id: contact?.id ?? null,
    deal_id: deal?.id ?? null,
    trigger_event: triggerEvent,
    trigger_data: triggerData,
    current_step: 1,
    status: "active",
    next_send_at: new Date(Date.now() + delayHours * 3600_000).toISOString(),
  });

  if (error) {
    console.error(`[drip-triggers] enrollment error for seq ${sequenceId}:`, error);
  } else {
    console.warn(`[drip-triggers] Enrolled user ${tgUserId} in drip "${sequenceId}" via ${triggerEvent}`);
  }
}

/**
 * Check if a group matches the sequence's group_ids filter.
 * Empty/missing group_ids means "all groups".
 */
function matchesGroup(sequence: DripSequence, chatId: number): boolean {
  const groupIds = sequence.trigger_config?.group_ids;
  if (!groupIds || groupIds.length === 0) return true;
  return groupIds.includes(chatId);
}

export function registerDripTriggers(bot: Bot) {
  // ── group_join: fires when a new user joins a group ──────────────
  bot.on("chat_member", async (ctx) => {
    const update = ctx.chatMember;
    const chat = update.chat;
    const chatType = chat.type;
    if (chatType !== "group" && chatType !== "supergroup") return;

    // Only trigger on user joining (was not member, now is member/admin)
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const isJoining =
      (oldStatus === "left" || oldStatus === "kicked") &&
      (newStatus === "member" || newStatus === "administrator" || newStatus === "restricted");

    if (!isJoining) return;

    const joinedUser = update.new_chat_member.user;
    if (joinedUser.is_bot) return;

    const chatId = chat.id;
    const chatTitle = "title" in chat ? (chat as { title: string }).title : String(chatId);

    const sequences = await getActiveSequences();
    const joinSequences = sequences.filter(
      (s) => s.trigger_event === "group_join" && matchesGroup(s, chatId)
    );

    for (const seq of joinSequences) {
      const enrolled = await isAlreadyEnrolled(seq.id, joinedUser.id);
      if (enrolled) continue;

      await enrollUser(seq.id, joinedUser.id, chatId, "group_join", {
        group_id: chatId,
        group_name: chatTitle,
        user_name: joinedUser.first_name + (joinedUser.last_name ? ` ${joinedUser.last_name}` : ""),
        username: joinedUser.username ?? null,
      });
    }
  });

  // ── first_message + keyword_match: fires on group text messages ──
  bot.on("message:text", async (ctx) => {
    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;
    if (ctx.from.is_bot) return;

    const sequences = await getActiveSequences();
    const messageText = ctx.message.text;
    const tgUserId = ctx.from.id;
    const chatId = chat.id;

    // first_message: check if this is the user's first message in this group
    const firstMsgSequences = sequences.filter(
      (s) => s.trigger_event === "first_message" && matchesGroup(s, chatId)
    );

    if (firstMsgSequences.length > 0) {
      // Check if user has sent messages before in this group
      const { count } = await supabase
        .from("tg_group_messages")
        .select("id", { count: "exact", head: true })
        .eq("telegram_chat_id", chatId)
        .eq("sender_telegram_id", tgUserId);

      // count <= 1 means this is their first (the current message was just stored by messages.ts)
      if ((count ?? 0) <= 1) {
        for (const seq of firstMsgSequences) {
          const enrolled = await isAlreadyEnrolled(seq.id, tgUserId);
          if (enrolled) continue;

          await enrollUser(seq.id, tgUserId, chatId, "first_message", {
            group_id: chatId,
            message_text: messageText.slice(0, 200),
            user_name: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ""),
          });
        }
      }
    }

    // keyword_match: check if message contains any trigger keywords
    const keywordSequences = sequences.filter(
      (s) => s.trigger_event === "keyword_match" && matchesGroup(s, chatId)
    );

    const lowerText = messageText.toLowerCase();
    for (const seq of keywordSequences) {
      const keywords = seq.trigger_config?.keywords ?? [];
      const matched = keywords.find((kw) => lowerText.includes(kw.toLowerCase()));
      if (!matched) continue;

      const enrolled = await isAlreadyEnrolled(seq.id, tgUserId);
      if (enrolled) continue;

      await enrollUser(seq.id, tgUserId, chatId, "keyword_match", {
        group_id: chatId,
        matched_keyword: matched,
        message_text: messageText.slice(0, 200),
        user_name: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ""),
      });
    }
  });
}
