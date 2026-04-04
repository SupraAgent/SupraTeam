/**
 * Outreach Sequence Trigger Handler
 * Listens for TG events and auto-enrolls users into active outreach sequences
 * built with the visual sequence canvas.
 *
 * Trigger types (from crm_outreach_sequences.trigger_type):
 * - manual:        No auto-enrollment (enrolled by reps from UI)
 * - group_join:    User joins a TG group
 * - first_message: User sends first message in a group
 * - keyword_match: Message contains a keyword from trigger_config.keywords
 *
 * The outreach-worker (outreach-worker.ts) then picks up active enrollments
 * and executes steps on schedule.
 */

import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

async function fireWebhookEvent(eventType: string, payload: Record<string, unknown>) {
  try {
    const { dispatchWebhook } = await import("../../lib/webhooks");
    await dispatchWebhook(eventType as import("../../lib/webhooks").WebhookEvent, payload);
  } catch (err) {
    console.error(`[sequence-triggers] webhook ${eventType} error:`, err);
  }
}

interface OutreachSequence {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: {
    group_ids?: number[];
    keywords?: string[];
  };
}

// ── Sequence cache (refreshed every 60s) ─────────────────────

let cachedSequences: OutreachSequence[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

async function getActiveSequences(): Promise<OutreachSequence[]> {
  if (cacheTimestamp > 0 && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSequences;
  }

  const { data } = await supabase
    .from("crm_outreach_sequences")
    .select("id, name, trigger_type, trigger_config")
    .eq("status", "active")
    .neq("trigger_type", "manual");

  cachedSequences = (data ?? []) as OutreachSequence[];
  cacheTimestamp = Date.now();
  return cachedSequences;
}

// ── Helpers ──────────────────────────────────────────────────

function matchesGroup(seq: OutreachSequence, chatId: number): boolean {
  const groupIds = seq.trigger_config?.group_ids;
  if (!groupIds || groupIds.length === 0) return true;
  return groupIds.includes(chatId);
}

async function isAlreadyEnrolled(sequenceId: string, tgChatId: string): Promise<boolean> {
  const { count } = await supabase
    .from("crm_outreach_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("sequence_id", sequenceId)
    .eq("tg_chat_id", tgChatId)
    .in("status", ["active", "paused"]);
  return (count ?? 0) > 0;
}

async function enrollInSequence(
  sequenceId: string,
  tgUserId: number,
  tgChatId: number,
  triggerData?: Record<string, unknown>
): Promise<void> {
  // Look up contact + deal + first step delay in parallel
  const [contactRes, dealRes, firstStepRes] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select("id")
      .eq("telegram_user_id", tgUserId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("crm_deals")
      .select("id")
      .eq("telegram_chat_id", tgChatId)
      .eq("outcome", "open")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("crm_outreach_steps")
      .select("delay_hours")
      .eq("sequence_id", sequenceId)
      .eq("step_number", 1)
      .maybeSingle(),
  ]);

  const delayHours = (firstStepRes.data?.delay_hours as number) ?? 0;

  const { data: enrollment, error } = await supabase.from("crm_outreach_enrollments").insert({
    sequence_id: sequenceId,
    deal_id: dealRes.data?.id ?? null,
    contact_id: contactRes.data?.id ?? null,
    tg_chat_id: String(tgChatId),
    current_step: 1,
    status: "active",
    next_send_at: new Date(Date.now() + delayHours * 3600_000).toISOString(),
    reply_count: 0,
  }).select("id").single();

  if (error) {
    console.error(`[sequence-triggers] enrollment error for seq ${sequenceId}:`, error);
  } else {
    console.warn(`[sequence-triggers] Enrolled chat ${tgChatId} in outreach "${sequenceId}"`);
    // Fire webhook for real-time UI notification
    fireWebhookEvent("sequence.enrolled", {
      enrollment_id: enrollment?.id,
      sequence_id: sequenceId,
      tg_chat_id: tgChatId,
      tg_user_id: tgUserId,
      trigger_data: triggerData ?? {},
      type: "outreach",
    }).catch(() => {});
  }
}

// ── Handler registration ─────────────────────────────────────

export function registerSequenceTriggers(bot: Bot) {
  // ── group_join: user joins a group ──
  bot.on("chat_member", async (ctx) => {
    const update = ctx.chatMember;
    const chat = update.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const user = update.new_chat_member.user;
    if (user.is_bot) return;

    const isJoining =
      (oldStatus === "left" || oldStatus === "kicked") &&
      (newStatus === "member" || newStatus === "administrator" || newStatus === "restricted");

    if (!isJoining) return;

    const sequences = await getActiveSequences();
    const matching = sequences.filter(
      (s) => s.trigger_type === "group_join" && matchesGroup(s, chat.id)
    );

    const chatTitle = chat.title;
    const userName = user.first_name + (user.last_name ? ` ${user.last_name}` : "");

    for (const seq of matching) {
      const enrolled = await isAlreadyEnrolled(seq.id, String(chat.id));
      if (enrolled) continue;
      await enrollInSequence(seq.id, user.id, chat.id, {
        trigger: "group_join",
        group_name: chatTitle,
        user_name: userName,
        username: user.username ?? null,
      });
    }
  });

  // ── first_message + keyword_match: group text messages ──
  bot.on("message:text", async (ctx) => {
    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;
    if (ctx.from.is_bot) return;

    const sequences = await getActiveSequences();
    if (sequences.length === 0) return;

    const messageText = ctx.message.text;
    const tgUserId = ctx.from.id;
    const chatId = chat.id;
    const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : "");

    // ── first_message ──
    const firstMsgSequences = sequences.filter(
      (s) => s.trigger_type === "first_message" && matchesGroup(s, chatId)
    );

    if (firstMsgSequences.length > 0) {
      const { count: priorCount } = await supabase
        .from("crm_outreach_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("tg_chat_id", String(chatId))
        .in("sequence_id", firstMsgSequences.map((s) => s.id));

      if ((priorCount ?? 0) === 0) {
        for (const seq of firstMsgSequences) {
          await enrollInSequence(seq.id, tgUserId, chatId, {
            trigger: "first_message",
            message_text: messageText.slice(0, 200),
            user_name: userName,
          });
        }
      }
    }

    // ── keyword_match ──
    const kwSequences = sequences.filter(
      (s) => s.trigger_type === "keyword_match" && matchesGroup(s, chatId)
    );

    const lowerText = messageText.toLowerCase();
    for (const seq of kwSequences) {
      const keywords = seq.trigger_config?.keywords ?? [];
      const matchedKw = keywords.find((kw) => lowerText.includes(kw.toLowerCase()));
      if (!matchedKw) continue;

      const enrolled = await isAlreadyEnrolled(seq.id, String(chatId));
      if (enrolled) continue;

      await enrollInSequence(seq.id, tgUserId, chatId, {
        trigger: "keyword_match",
        matched_keyword: matchedKw,
        message_text: messageText.slice(0, 200),
        user_name: userName,
      });
    }
  });
}
