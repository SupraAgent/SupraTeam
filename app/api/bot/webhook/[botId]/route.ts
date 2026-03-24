import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBotById, getDefaultBot } from "@/lib/bot-registry";
import { triggerWorkflowsByEvent } from "@/lib/workflow-engine";

export const runtime = "nodejs";
export const maxDuration = 10;

type RouteContext = { params: Promise<{ botId: string }> };

export async function POST(request: Request, ctx: RouteContext) {
  const { botId } = await ctx.params;

  // Resolve bot token from registry
  const bot = await getBotById(botId);
  if (!bot) return NextResponse.json({ error: "Unknown bot" }, { status: 404 });

  const token = bot.token;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "No supabase" }, { status: 503 });

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let update;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    // --- Handle commands ---
    if (update.message?.text?.startsWith("/")) {
      const chatId = update.message.chat.id;
      const chatType = update.message.chat.type;
      const command = update.message.text.split(" ")[0].split("@")[0];

      if ((command === "/start" || command === "/help") && chatType === "private") {
        await sendMessage(token, chatId, `Welcome to SupraCRM Bot (${bot.label})!\n\nCommands:\n/help - Show commands\n/status - Bot status\n/deals - Pipeline summary\n/deal - Show deal for this group (in groups)`);
      } else if (command === "/deal" && (chatType === "group" || chatType === "supergroup")) {
        const { data: tgGroup } = await supabase.from("tg_groups").select("id").eq("telegram_group_id", chatId).single();
        if (tgGroup) {
          const { data: linkedDeals } = await supabase.from("crm_deals").select("id, deal_name, board_type, value, stage:pipeline_stages(name)").eq("tg_group_id", tgGroup.id).limit(3);
          if (linkedDeals && linkedDeals.length > 0) {
            for (const d of linkedDeals) {
              const stageName = (d.stage as unknown as { name: string } | null)?.name ?? "Unknown";
              await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `${d.deal_name}\nBoard: ${d.board_type} | Stage: ${stageName}${d.value ? ` | $${Number(d.value).toLocaleString()}` : ""}`,
                  reply_markup: { inline_keyboard: [[{ text: "📊 Open in CRM", web_app: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/tma/deals/${d.id}` } }]] },
                }),
              });
            }
          } else {
            await sendMessage(token, chatId, "No deals linked to this group.");
          }
        }
      } else if (command === "/status") {
        const [g, d] = await Promise.all([
          supabase.from("tg_groups").select("id", { count: "exact", head: true }).eq("bot_id", bot.id),
          supabase.from("crm_deals").select("id", { count: "exact", head: true }),
        ]);
        await sendMessage(token, chatId, `${bot.label} Status\n\nGroups: ${g.count ?? 0}\nDeals: ${d.count ?? 0}`);
      } else if (command === "/deals") {
        const { data: stages } = await supabase.from("pipeline_stages").select("id, name, position").order("position");
        const { data: deals } = await supabase.from("crm_deals").select("stage_id");
        if (!stages || !deals || deals.length === 0) {
          await sendMessage(token, chatId, "No active deals.");
        } else {
          const counts: Record<string, number> = {};
          for (const d of deals) { if (d.stage_id) counts[d.stage_id] = (counts[d.stage_id] ?? 0) + 1; }
          const lines = stages.map((s) => `${s.position}. ${s.name}: ${counts[s.id] ?? 0}`);
          await sendMessage(token, chatId, `Pipeline (${deals.length} total)\n\n${lines.join("\n")}`);
        }
      }
    }

    // --- Handle group membership changes ---
    if (update.my_chat_member) {
      const chat = update.my_chat_member.chat;
      const status = update.my_chat_member.new_chat_member?.status;
      const chatType = chat.type;

      if (chatType === "group" || chatType === "supergroup" || chatType === "channel") {
        const isAdmin = status === "administrator";
        const isMember = status === "member";

        if (isAdmin || isMember) {
          // Upsert group and link to this bot
          const { data: group } = await supabase.from("tg_groups").upsert({
            telegram_group_id: chat.id,
            group_name: chat.title ?? `Chat ${chat.id}`,
            group_type: chatType,
            bot_is_admin: isAdmin,
            bot_id: bot.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: "telegram_group_id" }).select("id").single();

          // If group already existed with a different bot, update bot_id
          if (group) {
            await supabase.from("tg_groups").update({ bot_id: bot.id }).eq("id", group.id);
          }
        } else if (status === "left" || status === "kicked") {
          await supabase.from("tg_groups")
            .update({ bot_is_admin: false, updated_at: new Date().toISOString() })
            .eq("telegram_group_id", chat.id)
            .eq("bot_id", bot.id);
        }
      }
    }

    // --- Handle group text messages ---
    if (update.message?.text && !update.message.text.startsWith("/") && (update.message.chat.type === "group" || update.message.chat.type === "supergroup")) {
      const chat = update.message.chat;
      const from = update.message.from;
      const msgId = update.message.message_id;
      const text = update.message.text;
      const senderName = from.first_name + (from.last_name ? ` ${from.last_name}` : "");

      const { data: tgGroup } = await supabase
        .from("tg_groups")
        .select("id, group_name")
        .eq("telegram_group_id", chat.id)
        .single();

      if (!tgGroup) return NextResponse.json({ ok: true });

      await supabase.from("tg_groups").update({ last_message_at: new Date().toISOString() }).eq("id", tgGroup.id);

      // Fire workflow automations (non-blocking)
      triggerWorkflowsByEvent("tg_message", {
        chat_id: String(chat.id),
        group_name: tgGroup.group_name,
        sender_name: senderName,
        sender_username: from.username ?? "",
        message_text: text,
        message_link: `https://t.me/c/${String(chat.id).replace(/^-100/, "")}/${msgId}`,
        tg_group_id: tgGroup.id,
      }).catch((err: unknown) => console.error("[webhook] workflow trigger error:", err));

      const { data: deals } = await supabase
        .from("crm_deals")
        .select("id, deal_name, contact_id")
        .or(`telegram_chat_id.eq.${chat.id},tg_group_id.eq.${tgGroup.id}`);

      if (!deals || deals.length === 0) return NextResponse.json({ ok: true });

      const privateChatId = String(chat.id).replace(/^-100/, "");
      const tgDeepLink = `https://t.me/c/${privateChatId}/${msgId}`;

      for (const deal of deals) {
        const groupKey = `tg:${tgGroup.id}:${deal.id}`;
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

        const { data: existingNotif } = await supabase
          .from("crm_notifications")
          .select("id, grouped_count")
          .eq("group_key", groupKey)
          .eq("is_read", false)
          .in("status", ["active"])
          .gte("created_at", twoHoursAgo)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (existingNotif) {
          const newCount = (existingNotif.grouped_count ?? 1) + 1;
          await supabase.from("crm_notifications").update({
            title: `${newCount} messages in ${tgGroup.group_name}`,
            body: `${senderName}: ${text.length > 150 ? text.slice(0, 150) + "..." : text}`,
            grouped_count: newCount,
            tg_deep_link: tgDeepLink,
            tg_sender_name: senderName,
            updated_at: new Date().toISOString(),
          }).eq("id", existingNotif.id);
        } else {
          await supabase.from("crm_notifications").insert({
            type: "tg_message",
            deal_id: deal.id,
            tg_group_id: tgGroup.id,
            title: `${senderName} in ${tgGroup.group_name}`,
            body: text.length > 200 ? text.slice(0, 200) + "..." : text,
            tg_deep_link: tgDeepLink,
            tg_sender_name: senderName,
            pipeline_link: `/pipeline?highlight=${deal.id}`,
            group_key: groupKey,
            grouped_count: 1,
            status: "active",
          });
        }
      }
    }
  } catch (err) {
    console.error("[webhook] error:", err);
  }

  return NextResponse.json({ ok: true });
}

async function sendMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
