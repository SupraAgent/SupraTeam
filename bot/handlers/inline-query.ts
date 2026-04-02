/**
 * Inline mode handler — lets users search CRM deals from any chat
 * via @botname <query>. Returns matching deals as inline results.
 */

import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { escapeHtml } from "../../lib/telegram-templates.js";

const TMA_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
const MAX_INLINE_QUERY_LENGTH = 64;

// Per-user rate limit for inline queries (max 1 query/sec)
const inlineQueryLastSeen = new Map<number, number>();

/** Escape LIKE pattern wildcards to prevent pattern injection */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export function registerInlineHandler(bot: Bot) {
  bot.on("inline_query", async (ctx) => {
    // Per-user rate limit
    const now = Date.now();
    const lastSeen = inlineQueryLastSeen.get(ctx.from.id) ?? 0;
    if (now - lastSeen < 1000) {
      await ctx.answerInlineQuery([], { cache_time: 5 });
      return;
    }
    inlineQueryLastSeen.set(ctx.from.id, now);
    // Evict stale entries
    if (inlineQueryLastSeen.size > 500) {
      const cutoff = now - 60000;
      for (const [id, t] of inlineQueryLastSeen) {
        if (t < cutoff) inlineQueryLastSeen.delete(id);
      }
    }

    const query = ctx.inlineQuery.query.trim().toLowerCase().slice(0, MAX_INLINE_QUERY_LENGTH);

    // Resolve CRM user from telegram_id to verify they're a team member
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, crm_role")
      .eq("telegram_id", ctx.from.id)
      .single();

    if (!profile) {
      await ctx.answerInlineQuery([], {
        button: {
          text: "Connect your Telegram in CRM settings",
          start_parameter: "connect",
        },
        cache_time: 10,
      });
      return;
    }

    // Search deals by name
    let dealsQuery = supabase
      .from("crm_deals")
      .select("id, deal_name, board_type, stage_id, assigned_to, pipeline_stages(name)")
      .order("updated_at", { ascending: false })
      .limit(20);

    if (query.length > 0) {
      dealsQuery = dealsQuery.ilike("deal_name", `%${escapeLikePattern(query)}%`);
    }

    const { data: deals } = await dealsQuery;

    if (!deals || deals.length === 0) {
      await ctx.answerInlineQuery([], { cache_time: 10 });
      return;
    }

    const results = deals.map((deal) => {
      const stage = (deal as unknown as { pipeline_stages: { name: string } | null }).pipeline_stages;
      const stageName = stage?.name ?? "Unknown";
      const description = `${deal.board_type} • ${stageName}`;

      return {
        type: "article" as const,
        id: deal.id,
        title: deal.deal_name,
        description,
        input_message_content: {
          message_text: `<b>${escapeHtml(deal.deal_name)}</b>\n📊 ${escapeHtml(deal.board_type)} • ${escapeHtml(stageName)}`,
          parse_mode: "HTML" as const,
        },
        reply_markup: {
          inline_keyboard: [[
            { text: "Open in CRM", url: `${TMA_BASE_URL}/pipeline?highlight=${deal.id}` },
          ]],
        },
      };
    });

    await ctx.answerInlineQuery(results, { cache_time: 30, is_personal: true });
  });
}
