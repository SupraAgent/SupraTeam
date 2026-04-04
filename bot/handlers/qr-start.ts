import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { executeChatbotFlow } from "./chatbot-flow-executor.js";

/**
 * Handle /start commands with qr_ prefix for QR code lead capture.
 * Flow: scan QR -> /start qr_UUID -> record scan -> trigger chatbot flow OR open TMA apply flow.
 */
export function registerQrStartHandler(bot: Bot) {
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text ?? "";

    // Only handle /start qr_... in private chats
    if (ctx.chat.type !== "private" || !text.startsWith("/start qr_")) {
      return next();
    }

    const qrCodeId = text.replace("/start qr_", "").trim();
    if (!qrCodeId) return next();

    // Look up QR code config
    const { data: qrCode, error } = await supabase
      .from("crm_qr_codes")
      .select("id, name, campaign, source, pipeline_stage_id, assigned_to, custom_fields, redirect_url, chatbot_flow_id, is_active, expires_at")
      .eq("id", qrCodeId)
      .single();

    if (error || !qrCode) {
      await ctx.reply("This QR code is not valid. Please contact the event organizer.");
      return;
    }

    // Check active & expiry
    if (!qrCode.is_active) {
      await ctx.reply("This QR code is no longer active. Please contact the event organizer.");
      return;
    }

    if (qrCode.expires_at && new Date(qrCode.expires_at) < new Date()) {
      await ctx.reply("This QR code has expired. Please contact the event organizer.");
      return;
    }

    // Record scan
    const telegramUserId = ctx.from?.id;
    await supabase.from("crm_qr_scans").insert({
      qr_code_id: qrCode.id,
      telegram_user_id: telegramUserId ?? null,
      ip_hint: null, // Not available in bot context
    });

    // Increment scan count on the QR code
    await supabase.rpc("increment_counter", {
      row_id: qrCode.id,
      table_name: "crm_qr_codes",
      column_name: "scan_count",
    }).then(null, () => {
      // Fallback: direct update if rpc doesn't exist
      supabase
        .from("crm_qr_codes")
        .update({ scan_count: (qrCode as Record<string, unknown>).scan_count as number + 1 })
        .eq("id", qrCode.id)
        .then(null, () => {});
    });

    // If QR code has a chatbot flow, trigger it instead of TMA apply
    if (qrCode.chatbot_flow_id && telegramUserId) {
      try {
        const handled = await executeChatbotFlow(
          bot,
          qrCode.chatbot_flow_id as string,
          ctx.chat.id,
          telegramUserId,
          text
        );
        if (handled) return;
      } catch (err) {
        console.error("[qr-start] chatbot flow error:", err);
        // Fall through to TMA flow
      }
    }

    // Build TMA URL with QR context params
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      await ctx.reply("Configuration error. Please contact the team.");
      return;
    }

    const tmaParams = new URLSearchParams();
    tmaParams.set("qr_code_id", qrCode.id);
    if (qrCode.campaign) tmaParams.set("campaign", qrCode.campaign);
    if (qrCode.source) tmaParams.set("source", qrCode.source);

    const tmaUrl = `${siteUrl}/tma/apply?${tmaParams.toString()}`;

    const firstName = ctx.from?.first_name ?? "there";
    const campaignText = qrCode.campaign ? ` at ${qrCode.campaign}` : "";

    if (qrCode.redirect_url) {
      // Custom redirect: show message with inline keyboard
      await ctx.reply(
        `<b>Hey ${firstName}!</b> Welcome${campaignText}.\n\n` +
        `Tap the button below to get started with your application.`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Start Application",
                  web_app: { url: tmaUrl },
                },
              ],
              [
                {
                  text: "Learn More",
                  url: qrCode.redirect_url,
                },
              ],
            ],
          },
        }
      );
    } else {
      // Default: directly open TMA apply flow
      await ctx.reply(
        `<b>Hey ${firstName}!</b> Welcome${campaignText}.\n\n` +
        `Tap below to start your application — it only takes a few minutes!`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Start Application",
                  web_app: { url: tmaUrl },
                },
              ],
            ],
          },
        }
      );
    }
  });
}
