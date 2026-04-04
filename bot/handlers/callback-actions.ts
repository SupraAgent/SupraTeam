/**
 * Inline CRM Actions — handles callback_query from inline keyboard buttons
 * in push notification DMs. Supports: View Deal, Mark Follow-up, Skip Stage.
 */

import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { supabase } from "../lib/supabase.js";
import { executeDealMove } from "../../lib/deal-move.js";
import {
  getCalendlyEventTypes,
  createSchedulingLink,
  type CalendlyEventType,
} from "../../lib/calendly/client.js";

// Short-lived cache for event type picker (cleared after selection)
const bookingEventTypeCache = new Map<string, CalendlyEventType[]>();

export function registerCallbackHandler(bot: Bot) {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("crm:")) return;

    const parts = data.split(":");
    if (parts.length < 3) {
      await ctx.answerCallbackQuery({ text: "Invalid action" });
      return;
    }

    const action = parts[1];
    const dealId = parts[2];
    const telegramUserId = ctx.from.id;

    // Resolve CRM user from telegram_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, crm_role, display_name")
      .eq("telegram_id", telegramUserId)
      .single();

    if (!profile) {
      await ctx.answerCallbackQuery({ text: "Account not linked. Open CRM to link your Telegram." });
      return;
    }

    // Authorization: verify user is assigned to the deal or is an admin
    const isAdmin = profile.crm_role === "admin_lead";
    if (!isAdmin) {
      const { data: deal } = await supabase
        .from("crm_deals")
        .select("assigned_to")
        .eq("id", dealId)
        .single();

      if (deal?.assigned_to !== profile.id) {
        await ctx.answerCallbackQuery({ text: "Only the assigned rep or admin can perform this action." });
        return;
      }
    }

    // Log the callback action
    await supabase.from("crm_tg_callback_actions").insert({
      deal_id: dealId,
      user_id: profile.id,
      action,
      telegram_user_id: telegramUserId,
      callback_data: data,
    });

    const changedByName = profile.display_name ?? `User ${profile.id.slice(0, 8)}`;

    try {
      switch (action) {
        case "followup": {
          // Move deal to "Follow Up" stage
          const { data: followUpStage } = await supabase
            .from("pipeline_stages")
            .select("id, name")
            .eq("name", "Follow Up")
            .single();

          if (!followUpStage) {
            await ctx.answerCallbackQuery({ text: "Follow Up stage not found" });
            return;
          }

          const result = await executeDealMove({
            dealId,
            toStageId: followUpStage.id,
            changedByUserId: profile.id,
            changedByName,
          });

          if (!result.success) {
            await ctx.answerCallbackQuery({ text: result.error ?? "Move failed" });
            return;
          }

          await ctx.answerCallbackQuery({ text: `Moved to ${followUpStage.name}` });

          try {
            await ctx.editMessageText(
              ctx.callbackQuery.message?.text + `\n\nMoved to ${followUpStage.name}`,
            );
          } catch {
            // Message might be too old to edit
          }
          break;
        }

        case "skip_stage": {
          // Move deal to next stage in pipeline
          const { data: deal } = await supabase
            .from("crm_deals")
            .select("id, deal_name, stage_id, board_type")
            .eq("id", dealId)
            .single();

          if (!deal) {
            await ctx.answerCallbackQuery({ text: "Deal not found" });
            return;
          }

          // Get current stage position and find next within the same board_type
          const { data: currentStage } = await supabase
            .from("pipeline_stages")
            .select("position, board_type")
            .eq("id", deal.stage_id)
            .single();

          if (!currentStage) {
            await ctx.answerCallbackQuery({ text: "Current stage not found" });
            return;
          }

          let nextStageQuery = supabase
            .from("pipeline_stages")
            .select("id, name")
            .gt("position", currentStage.position)
            .order("position")
            .limit(1);

          if (currentStage.board_type) {
            nextStageQuery = nextStageQuery.eq("board_type", currentStage.board_type);
          }

          const { data: nextStage } = await nextStageQuery.single();

          if (!nextStage) {
            await ctx.answerCallbackQuery({ text: "Already at final stage" });
            return;
          }

          const result = await executeDealMove({
            dealId,
            toStageId: nextStage.id,
            changedByUserId: profile.id,
            changedByName,
          });

          if (!result.success) {
            await ctx.answerCallbackQuery({ text: result.error ?? "Move failed" });
            return;
          }

          await ctx.answerCallbackQuery({ text: `Skipped to ${nextStage.name}` });

          try {
            await ctx.editMessageText(
              ctx.callbackQuery.message?.text + `\n\nSkipped to ${nextStage.name}`,
            );
          } catch {
            // Message might be too old to edit
          }
          break;
        }

        case "book": {
          // Show Calendly event type picker or auto-send if only one
          await ctx.answerCallbackQuery({ text: "Loading event types..." });

          const eventTypes = await getCalendlyEventTypes(profile.id);
          if (eventTypes.length === 0) {
            await ctx.reply("No active Calendly event types found. Connect Calendly in CRM settings first.");
            break;
          }

          if (eventTypes.length === 1) {
            // Auto-generate link for the single event type
            await generateAndSendBookingLink(ctx, profile, dealId, eventTypes[0].uri, eventTypes[0].name, eventTypes[0].duration);
          } else {
            // Show picker — use index (0-7) since callback_data is 64 bytes max
            // Cache event types keyed by deal+user for the booktype handler
            bookingEventTypeCache.set(`${profile.id}:${dealId}`, eventTypes);
            const keyboard = new InlineKeyboard();
            for (let i = 0; i < Math.min(eventTypes.length, 8); i++) {
              const et = eventTypes[i];
              keyboard.text(
                `${et.name} (${et.duration}min)`,
                `crm:booktype:${dealId}:${i}`
              ).row();
            }
            await ctx.reply("Choose an event type:", { reply_markup: keyboard });
          }
          break;
        }

        case "booktype": {
          // Generate booking link for a specific event type (selected by index)
          const idx = parseInt(parts[3] ?? "", 10);
          const cached = bookingEventTypeCache.get(`${profile.id}:${dealId}`);
          const selected = cached?.[idx];

          if (!selected) {
            // Cache expired or invalid — refetch and try by index
            const refetched = await getCalendlyEventTypes(profile.id);
            const fallback = refetched[idx];
            if (!fallback) {
              await ctx.answerCallbackQuery({ text: "Event type not found. Try again." });
              break;
            }
            await ctx.answerCallbackQuery({ text: "Generating link..." });
            await generateAndSendBookingLink(ctx, profile, dealId, fallback.uri, fallback.name, fallback.duration);
          } else {
            await ctx.answerCallbackQuery({ text: "Generating link..." });
            await generateAndSendBookingLink(ctx, profile, dealId, selected.uri, selected.name, selected.duration);
          }

          // Clean up cache entry
          bookingEventTypeCache.delete(`${profile.id}:${dealId}`);
          break;
        }

        default:
          await ctx.answerCallbackQuery({ text: "Unknown action" });
      }
    } catch (err) {
      console.error(`[callback-actions] Error handling ${action}:`, err);
      await ctx.answerCallbackQuery({ text: "Action failed. Try from the CRM." });
    }
  });

  console.log("[bot/callback] Registered inline CRM action handler");
}

/**
 * Generate a tracked Calendly booking link and send it to the chat.
 * Mirrors the logic in app/api/calendly/booking-link/route.ts but runs
 * within the bot process.
 */
async function generateAndSendBookingLink(
  ctx: { reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown>; chat?: { id: number } },
  profile: { id: string; display_name: string | null },
  dealId: string,
  eventTypeUri: string,
  eventTypeName: string,
  eventTypeDuration: number | null,
) {
  // Get deal + contact info for UTM tracking
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("id, deal_name, contact_id")
    .eq("id", dealId)
    .single();

  // Create single-use scheduling link
  const { booking_url } = await createSchedulingLink(profile.id, eventTypeUri);

  // Append UTM params for webhook matching
  const url = new URL(booking_url);
  url.searchParams.set("utm_source", "supracrm");
  url.searchParams.set("utm_campaign", dealId);
  if (deal?.contact_id) url.searchParams.set("utm_content", deal.contact_id);
  const trackedUrl = url.toString();

  // Store booking link
  const { data: bookingLink } = await supabase
    .from("crm_booking_links")
    .insert({
      user_id: profile.id,
      deal_id: dealId,
      contact_id: deal?.contact_id || null,
      calendly_event_type_uri: eventTypeUri,
      calendly_event_type_name: eventTypeName,
      calendly_event_type_duration: eventTypeDuration,
      calendly_scheduling_link: trackedUrl,
      utm_params: { utm_source: "supracrm", utm_campaign: dealId },
      tg_chat_id: ctx.chat?.id ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  // Send booking link in chat
  const durationText = eventTypeDuration ? ` (${eventTypeDuration} min)` : "";
  await ctx.reply(
    `📅 *${eventTypeName}*${durationText}\n\nBook here: ${trackedUrl}`,
    { parse_mode: "Markdown" },
  );

  // Log deal activity
  if (bookingLink) {
    supabase.from("crm_deal_activities").insert({
      deal_id: dealId,
      user_id: profile.id,
      activity_type: "booking_link_sent",
      title: `Booking link sent via Telegram: ${eventTypeName}`,
      metadata: {
        booking_link_id: bookingLink.id,
        event_type: eventTypeName,
        source: "telegram_bot",
      },
      reference_id: bookingLink.id,
      reference_type: "booking_link",
    }).then(({ error }) => {
      if (error) console.error("[bot/booking] activity log error:", error);
    });
  }
}
