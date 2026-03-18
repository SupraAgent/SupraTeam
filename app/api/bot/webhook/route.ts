import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: "No bot token" }, { status: 503 });

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
    // Handle /start, /help, /status, /deals commands
    if (update.message?.text?.startsWith("/")) {
      const chatId = update.message.chat.id;
      const command = update.message.text.split(" ")[0].split("@")[0];

      if (command === "/start" || command === "/help") {
        await sendMessage(token, chatId, "Welcome to SupraCRM Bot!\n\nCommands:\n/help - Show commands\n/status - Bot status\n/deals - Pipeline summary");
      } else if (command === "/status") {
        const [g, d] = await Promise.all([
          supabase.from("tg_groups").select("id", { count: "exact", head: true }).eq("bot_is_admin", true),
          supabase.from("crm_deals").select("id", { count: "exact", head: true }),
        ]);
        await sendMessage(token, chatId, `SupraCRM Bot Status\n\nGroups: ${g.count ?? 0}\nDeals: ${d.count ?? 0}`);
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

    // Handle group membership changes
    if (update.my_chat_member) {
      const chat = update.my_chat_member.chat;
      const status = update.my_chat_member.new_chat_member?.status;
      const chatType = chat.type;

      if (chatType === "group" || chatType === "supergroup" || chatType === "channel") {
        const isAdmin = status === "administrator";
        const isMember = status === "member";

        if (isAdmin || isMember) {
          await supabase.from("tg_groups").upsert({
            telegram_group_id: chat.id,
            group_name: chat.title ?? `Chat ${chat.id}`,
            group_type: chatType,
            bot_is_admin: isAdmin,
            updated_at: new Date().toISOString(),
          }, { onConflict: "telegram_group_id" });
        } else if (status === "left" || status === "kicked") {
          await supabase.from("tg_groups")
            .update({ bot_is_admin: false, updated_at: new Date().toISOString() })
            .eq("telegram_group_id", chat.id);
        }
      }
    }

    // Handle group text messages -> notifications
    if (update.message?.text && (update.message.chat.type === "group" || update.message.chat.type === "supergroup")) {
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

      if (tgGroup) {
        const { data: deals } = await supabase
          .from("crm_deals")
          .select("id, deal_name")
          .eq("telegram_chat_id", chat.id);

        if (deals && deals.length > 0) {
          const privateChatId = String(chat.id).replace(/^-100/, "");
          for (const deal of deals) {
            await supabase.from("crm_notifications").insert({
              type: "tg_message",
              deal_id: deal.id,
              tg_group_id: tgGroup.id,
              title: `${senderName} in ${tgGroup.group_name}`,
              body: text.length > 200 ? text.slice(0, 200) + "..." : text,
              tg_deep_link: `https://t.me/c/${privateChatId}/${msgId}`,
              tg_sender_name: senderName,
              pipeline_link: `/pipeline?highlight=${deal.id}`,
            });
          }
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
