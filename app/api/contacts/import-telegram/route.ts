import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

type TelegramChatMember = {
  user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    is_bot: boolean;
  };
  status: string;
};

async function getChatAdministrators(chatId: number): Promise<TelegramChatMember[]> {
  if (!BOT_TOKEN) return [];
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators?chat_id=${chatId}`
  );
  const data = await res.json();
  return data.ok ? data.result : [];
}

async function getChatMemberCount(chatId: number): Promise<number> {
  if (!BOT_TOKEN) return 0;
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getChatMemberCount?chat_id=${chatId}`
  );
  const data = await res.json();
  return data.ok ? data.result : 0;
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;
  if (!BOT_TOKEN) return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });

  const { group_id } = await request.json();
  if (!group_id) {
    return NextResponse.json({ error: "group_id is required" }, { status: 400 });
  }

  // Get the TG group record
  const { data: group } = await supabase
    .from("tg_groups")
    .select("telegram_group_id, group_name")
    .eq("id", group_id)
    .single();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const chatId = group.telegram_group_id;

  // Telegram API only lets bots get admins list, not all members
  // For supergroups, getChatAdministrators returns admins
  // We import admins as contacts (best we can do without user bot)
  const members = await getChatAdministrators(chatId);
  const memberCount = await getChatMemberCount(chatId);

  // Filter out bots
  const humans = members.filter((m) => !m.user.is_bot);

  if (humans.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: 0,
      total_members: memberCount,
      message: "No non-bot admins found. Telegram API only allows importing group admins.",
    });
  }

  let imported = 0;
  let skipped = 0;

  for (const member of humans) {
    const { user } = member;
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");

    // Check if contact with this telegram_user_id already exists
    const { data: existing } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("telegram_user_id", user.id)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("crm_contacts").insert({
      name,
      telegram_username: user.username || null,
      telegram_user_id: user.id,
      company: group.group_name,
      notes: `Imported from Telegram group: ${group.group_name}`,
      created_by: user.id,
    });

    if (!error) {
      imported++;
    } else {
      console.error("[import-telegram] insert error:", error);
      skipped++;
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    total_members: memberCount,
    admin_count: humans.length,
    message: `Imported ${imported} contacts from ${group.group_name}. ${skipped} skipped (already exist or failed).`,
  });
}
