/**
 * Inline CRM Actions — handles callback_query from inline keyboard buttons
 * in push notification DMs. Supports: View Deal, Mark Follow-up, Skip Stage.
 */

import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

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
      .select("id")
      .eq("telegram_id", telegramUserId)
      .single();

    if (!profile) {
      await ctx.answerCallbackQuery({ text: "Account not linked. Open CRM to link your Telegram." });
      return;
    }

    // Log the callback action
    await supabase.from("crm_tg_callback_actions").insert({
      deal_id: dealId,
      user_id: profile.id,
      action,
      telegram_user_id: telegramUserId,
      callback_data: data,
    });

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

          const { data: deal } = await supabase
            .from("crm_deals")
            .select("id, deal_name, stage_id")
            .eq("id", dealId)
            .single();

          if (!deal) {
            await ctx.answerCallbackQuery({ text: "Deal not found" });
            return;
          }

          if (deal.stage_id === followUpStage.id) {
            await ctx.answerCallbackQuery({ text: `Already at ${followUpStage.name}` });
            return;
          }

          await supabase
            .from("crm_deals")
            .update({ stage_id: followUpStage.id })
            .eq("id", dealId);

          // Log stage change
          await supabase.from("crm_deal_stage_history").insert({
            deal_id: dealId,
            from_stage_id: deal.stage_id,
            to_stage_id: followUpStage.id,
            changed_by: profile.id,
          });

          await ctx.answerCallbackQuery({ text: `✅ ${deal.deal_name} → ${followUpStage.name}` });

          // Update the message to show the action was taken
          try {
            await ctx.editMessageText(
              ctx.callbackQuery.message?.text + `\n\n✅ Moved to ${followUpStage.name}`,
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
            .select("id, deal_name, stage_id")
            .eq("id", dealId)
            .single();

          if (!deal) {
            await ctx.answerCallbackQuery({ text: "Deal not found" });
            return;
          }

          // Get current stage position and find next
          const { data: currentStage } = await supabase
            .from("pipeline_stages")
            .select("position")
            .eq("id", deal.stage_id)
            .single();

          if (!currentStage) {
            await ctx.answerCallbackQuery({ text: "Current stage not found" });
            return;
          }

          const { data: nextStage } = await supabase
            .from("pipeline_stages")
            .select("id, name")
            .gt("position", currentStage.position)
            .order("position")
            .limit(1)
            .single();

          if (!nextStage) {
            await ctx.answerCallbackQuery({ text: "Already at final stage" });
            return;
          }

          await supabase
            .from("crm_deals")
            .update({ stage_id: nextStage.id })
            .eq("id", dealId);

          await supabase.from("crm_deal_stage_history").insert({
            deal_id: dealId,
            from_stage_id: deal.stage_id,
            to_stage_id: nextStage.id,
            changed_by: profile.id,
          });

          await ctx.answerCallbackQuery({ text: `⏩ ${deal.deal_name} → ${nextStage.name}` });

          try {
            await ctx.editMessageText(
              ctx.callbackQuery.message?.text + `\n\n⏩ Skipped to ${nextStage.name}`,
            );
          } catch {
            // Message might be too old to edit
          }
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
