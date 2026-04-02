/**
 * Inline CRM Actions — handles callback_query from inline keyboard buttons
 * in push notification DMs. Supports: View Deal, Mark Follow-up, Skip Stage.
 */

import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { executeDealMove } from "../../lib/deal-move.js";

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
