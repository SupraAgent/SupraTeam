import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { triggerWorkflowsByEvent } from "@/lib/workflow-engine";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: "No bot token" }, { status: 503 });

  // Validate webhook secret header (required)
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (secretHeader !== webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

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
    // --- Handle commands (private + group) ---
    if (update.message?.text?.startsWith("/")) {
      const chatId = update.message.chat.id;
      const chatType = update.message.chat.type;
      const command = update.message.text.split(" ")[0].split("@")[0];

      if ((command === "/start" || command === "/help") && chatType === "private") {
        await sendMessage(token, chatId, "Welcome to SupraTeam Bot!\n\nCommands:\n/help - Show commands\n/status - Bot status\n/deals - Pipeline summary\n/deal - Show deal for this group (in groups)");
      } else if (command === "/contact" && (chatType === "group" || chatType === "supergroup")) {
        // Show assigned Supra team member for this group
        const { data: tgGroup } = await supabase.from("tg_groups").select("id").eq("telegram_group_id", chatId).single();
        if (tgGroup) {
          const { data: linkedDeals } = await supabase
            .from("crm_deals")
            .select("deal_name, board_type, assigned_to")
            .eq("tg_group_id", tgGroup.id)
            .not("assigned_to", "is", null)
            .limit(5);

          if (linkedDeals && linkedDeals.length > 0) {
            const assignedIds = [...new Set(linkedDeals.map((d) => d.assigned_to).filter(Boolean))];
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, display_name, crm_role")
              .in("id", assignedIds);

            const profileMap: Record<string, { display_name: string; crm_role: string | null }> = {};
            if (profiles) {
              for (const p of profiles) profileMap[p.id] = { display_name: p.display_name, crm_role: p.crm_role };
            }

            const roleLabels: Record<string, string> = { bd_lead: "BD", marketing_lead: "Marketing", admin_lead: "Admin" };
            const seen = new Set<string>();
            const contactLines: string[] = [];
            for (const d of linkedDeals) {
              if (!d.assigned_to || seen.has(d.assigned_to)) continue;
              seen.add(d.assigned_to);
              const profile = profileMap[d.assigned_to];
              if (profile) {
                const role = profile.crm_role ? ` (${roleLabels[profile.crm_role] ?? profile.crm_role})` : "";
                contactLines.push(`• ${profile.display_name}${role}`);
              }
            }

            if (contactLines.length > 0) {
              await sendMessage(token, chatId, `Your Supra point of contact:\n\n${contactLines.join("\n")}`);
            } else {
              await sendMessage(token, chatId, "No team member assigned yet. We'll get someone connected shortly.");
            }
          } else {
            await sendMessage(token, chatId, "No team member assigned yet. We'll get someone connected shortly.");
          }
        }
      } else if (command === "/status" && chatType === "private") {
        const [g, d] = await Promise.all([
          supabase.from("tg_groups").select("id", { count: "exact", head: true }).eq("bot_is_admin", true),
          supabase.from("crm_deals").select("id", { count: "exact", head: true }),
        ]);
        await sendMessage(token, chatId, `SupraTeam Bot Status\n\nGroups: ${g.count ?? 0}\nDeals: ${d.count ?? 0}`);
      } else if (command === "/deals" && chatType === "private") {
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

    // --- Handle group text messages (skip commands) ---
    if (update.message?.text && !update.message.text.startsWith("/") && (update.message.chat.type === "group" || update.message.chat.type === "supergroup")) {
      const chat = update.message.chat;
      const from = update.message.from;
      const msgId = update.message.message_id;
      const text = update.message.text;
      const senderName = from.first_name + (from.last_name ? ` ${from.last_name}` : "");
      const senderUsername = from.username ?? null;
      const isBot = from.is_bot;

      // Find the TG group
      const { data: tgGroup } = await supabase
        .from("tg_groups")
        .select("id, group_name")
        .eq("telegram_group_id", chat.id)
        .single();

      if (!tgGroup) return NextResponse.json({ ok: true });

      // Trigger matching workflows (non-blocking)
      const privateChatIdForLink = String(chat.id).replace(/^-100/, "");
      const tgMessageLink = `https://t.me/c/${privateChatIdForLink}/${msgId}`;
      triggerWorkflowsByEvent("tg_message", {
        chat_id: String(chat.id),
        group_name: tgGroup.group_name,
        sender_name: senderName,
        sender_username: senderUsername,
        message_text: text,
        message_link: tgMessageLink,
        tg_group_id: tgGroup.id,
      }).catch((err) => console.error("[webhook] workflow trigger error:", err));

      // Update last_message_at in real-time
      await supabase
        .from("tg_groups")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", tgGroup.id);

      // Find linked deals: by telegram_chat_id OR by tg_group_id
      const { data: deals } = await supabase
        .from("crm_deals")
        .select("id, deal_name, contact_id")
        .or(`telegram_chat_id.eq.${chat.id},tg_group_id.eq.${tgGroup.id}`);

      if (!deals || deals.length === 0) return NextResponse.json({ ok: true });

      const privateChatId = String(chat.id).replace(/^-100/, "");
      const tgDeepLink = `https://t.me/c/${privateChatId}/${msgId}`;

      // Check if sender is a team member (has a profile with matching telegram_id)
      let isTeamMember = false;
      if (from.id) {
        const { data: teamProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("telegram_id", from.id)
          .limit(1)
          .single();
        isTeamMember = !!teamProfile;
      }

      for (const deal of deals) {
        // Smart notification grouping: batch messages from same group+deal
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
          // Batch into existing notification
          const newCount = (existingNotif.grouped_count ?? 1) + 1;
          await supabase
            .from("crm_notifications")
            .update({
              title: `${newCount} messages in ${tgGroup.group_name}`,
              body: `${senderName}: ${text.length > 150 ? text.slice(0, 150) + "..." : text}`,
              grouped_count: newCount,
              tg_deep_link: tgDeepLink,
              tg_sender_name: senderName,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingNotif.id);
        } else {
          // Create new notification with group_key
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

        if (!isBot) {
          if (isTeamMember) {
            // Team member responded — clear active highlights and record response time
            const { data: activeHighlights } = await supabase
              .from("crm_highlights")
              .select("id, created_at")
              .eq("deal_id", deal.id)
              .eq("is_active", true);

            if (activeHighlights && activeHighlights.length > 0) {
              const now = new Date();
              for (const h of activeHighlights) {
                const responseTimeMs = now.getTime() - new Date(h.created_at).getTime();
                await supabase
                  .from("crm_highlights")
                  .update({
                    is_active: false,
                    cleared_at: now.toISOString(),
                    cleared_by: "team_response",
                    responded_at: now.toISOString(),
                    response_time_ms: responseTimeMs,
                  })
                  .eq("id", h.id);
              }

              await supabase
                .from("crm_deals")
                .update({ awaiting_response_since: null })
                .eq("id", deal.id);
            }
          } else {
            // External sender — dedup + create highlight
            const { data: activeHighlights } = await supabase
              .from("crm_highlights")
              .select("id, sender_name")
              .eq("deal_id", deal.id)
              .eq("is_active", true);

            if (activeHighlights && activeHighlights.length > 0) {
              const fromDifferent = activeHighlights.some((h) => h.sender_name !== senderName);
              if (fromDifferent) {
                await supabase
                  .from("crm_highlights")
                  .update({ is_active: false, cleared_at: new Date().toISOString(), cleared_by: "response" })
                  .eq("deal_id", deal.id)
                  .eq("is_active", true);
              }
            }

            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: recentHighlight } = await supabase
              .from("crm_highlights")
              .select("id")
              .eq("deal_id", deal.id)
              .eq("sender_name", senderName)
              .eq("is_active", true)
              .gte("created_at", twentyFourHoursAgo)
              .limit(1);

            if (!recentHighlight || recentHighlight.length === 0) {
              const lowerText = text.toLowerCase();
              const urgentWords = ["urgent", "asap", "immediately", "critical", "deadline"];
              const highWords = ["ready to sign", "contract", "payment", "invoice", "approve", "confirm"];
              const negativeWords = ["cancel", "delay", "problem", "issue", "disappointed", "frustrated", "concerned"];
              const positiveWords = ["excited", "great", "love", "perfect", "amazing", "deal", "agree", "yes"];

              let priority: "low" | "medium" | "high" | "urgent" = "medium";
              if (urgentWords.some((w) => lowerText.includes(w))) priority = "urgent";
              else if (highWords.some((w) => lowerText.includes(w))) priority = "high";

              let sentiment: "positive" | "neutral" | "negative" = "neutral";
              if (negativeWords.some((w) => lowerText.includes(w))) sentiment = "negative";
              else if (positiveWords.some((w) => lowerText.includes(w))) sentiment = "positive";

              await supabase.from("crm_highlights").insert({
                deal_id: deal.id,
                contact_id: deal.contact_id,
                tg_group_id: tgGroup.id,
                sender_name: senderName,
                message_preview: text.length > 100 ? text.slice(0, 100) + "..." : text,
                tg_deep_link: tgDeepLink,
                highlight_type: "tg_message",
                priority,
                sentiment,
              });

              await supabase
                .from("crm_deals")
                .update({ awaiting_response_since: new Date().toISOString() })
                .eq("id", deal.id);
            }
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
