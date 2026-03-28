/**
 * Broadcast Response Tracker
 * Runs hourly. For broadcasts sent in the last 48h, checks if the group
 * had any non-bot activity after the broadcast (within 24h window).
 * This measures "did the broadcast spark conversation?" — not individual responses,
 * since broadcasts go to groups, not individuals.
 * Updates aggregate metrics on the broadcast record.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const RESPONSE_WINDOW_HOURS = 24;

interface Recipient {
  id: string;
  broadcast_id: string;
  telegram_group_id: number;
  sent_at: string;
}

async function trackResponses() {
  const cutoff48h = new Date(Date.now() - 48 * 3600_000).toISOString();

  // Find sent recipients from last 48h without a response yet
  const { data: recipients, error } = await supabase
    .from("crm_broadcast_recipients")
    .select("id, broadcast_id, telegram_group_id, sent_at")
    .eq("status", "sent")
    .is("responded_at", null)
    .gte("sent_at", cutoff48h)
    .limit(200);

  if (error) {
    console.error("[response-tracker] query error:", error);
    return;
  }

  if (!recipients || recipients.length === 0) return;

  let updatedCount = 0;

  // Group recipients by telegram_group_id for batch message lookup
  const byGroup = new Map<number, Recipient[]>();
  for (const r of recipients as Recipient[]) {
    const group = byGroup.get(r.telegram_group_id) ?? [];
    group.push(r);
    byGroup.set(r.telegram_group_id, group);
  }

  for (const [groupId, groupRecipients] of byGroup) {
    // Find the earliest sent_at for this group to narrow the search window
    const earliestSent = groupRecipients.reduce(
      (min, r) => (r.sent_at < min ? r.sent_at : min),
      groupRecipients[0].sent_at
    );

    // Fetch messages in this group after the broadcast was sent
    const { data: messages } = await supabase
      .from("tg_group_messages")
      .select("telegram_chat_id, sent_at")
      .eq("telegram_chat_id", groupId)
      .eq("is_from_bot", false)
      .gte("sent_at", earliestSent)
      .order("sent_at", { ascending: true })
      .limit(500);

    if (!messages || messages.length === 0) continue;

    // For each recipient, check if the group had any activity in the response window
    for (const recipient of groupRecipients) {
      const broadcastTime = new Date(recipient.sent_at).getTime();
      const windowEnd = broadcastTime + RESPONSE_WINDOW_HOURS * 3600_000;

      const firstResponse = messages.find((m) => {
        const msgTime = new Date(m.sent_at).getTime();
        return msgTime > broadcastTime && msgTime <= windowEnd;
      });

      if (firstResponse) {
        await supabase
          .from("crm_broadcast_recipients")
          .update({ responded_at: firstResponse.sent_at })
          .eq("id", recipient.id);
        updatedCount++;
      }
    }
  }

  // Update aggregate metrics on broadcasts that had responses tracked
  const broadcastIds = [...new Set(recipients.map((r) => r.broadcast_id))];
  for (const broadcastId of broadcastIds) {
    const [sentRes, respondedRes] = await Promise.all([
      supabase
        .from("crm_broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", broadcastId)
        .eq("status", "sent"),
      supabase
        .from("crm_broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", broadcastId)
        .not("responded_at", "is", null),
    ]);

    const sentCount = sentRes.count ?? 0;
    const responseCount = respondedRes.count ?? 0;
    const responseRate = sentCount > 0 ? Math.round((responseCount / sentCount) * 10000) / 100 : 0;

    await supabase
      .from("crm_broadcasts")
      .update({ response_count: responseCount, response_rate: responseRate })
      .eq("id", broadcastId);
  }

  console.warn(`[response-tracker] Tracked ${updatedCount} responses across ${broadcastIds.length} broadcasts`);
}

// Entry point
trackResponses()
  .catch((err) => console.error("[response-tracker] fatal:", err))
  .finally(() => process.exit(0));
