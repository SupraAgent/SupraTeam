/**
 * GET  /api/groups/members?group_id=xxx — List members with engagement data
 * POST /api/groups/members — Sync members from Telegram bot API
 * PATCH /api/groups/members — Flag/unflag a member or link to CRM contact
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** Compute engagement tier from message counts and recency */
function computeEngagementTier(
  msg7d: number,
  msg30d: number,
  lastMessageAt: string | null
): string {
  const daysSinceLast = lastMessageAt
    ? (Date.now() - new Date(lastMessageAt).getTime()) / 86_400_000
    : Infinity;

  if (daysSinceLast > 30) return "dormant";
  if (msg7d >= 10) return "champion";
  if (msg7d >= 3) return "active";
  if (msg30d >= 5) return "casual";
  if (msg30d >= 1) return "lurker";
  return "new";
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("group_id");

  if (!groupId) {
    return NextResponse.json({ error: "group_id required" }, { status: 400 });
  }

  const { data: members, error } = await supabase
    .from("tg_group_members")
    .select("*, contact:crm_contacts(id, name, email, telegram_username)")
    .eq("group_id", groupId)
    .order("message_count_7d", { ascending: false });

  if (error) {
    console.error("[groups/members]", error.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  // Compute summary stats
  const total = members?.length ?? 0;
  const byTier: Record<string, number> = {};
  const flagged: typeof members = [];

  for (const m of members ?? []) {
    byTier[m.engagement_tier] = (byTier[m.engagement_tier] ?? 0) + 1;
    if (m.is_flagged) flagged.push(m);
  }

  return NextResponse.json({
    members: members ?? [],
    summary: { total, byTier, flaggedCount: flagged.length },
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  const { group_id } = await request.json();

  if (!group_id) {
    return NextResponse.json({ error: "group_id required" }, { status: 400 });
  }

  // Get group's telegram_group_id
  const { data: group } = await supabase
    .from("tg_groups")
    .select("telegram_group_id")
    .eq("id", group_id)
    .single();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Fetch admins from Telegram
  let admins: { user: { id: number; first_name: string; last_name?: string; username?: string }; status: string }[] = [];
  try {
    const adminRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatAdministrators`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: group.telegram_group_id }),
      }
    );
    const adminData = await adminRes.json();
    if (adminData.ok) admins = adminData.result ?? [];
  } catch {
    // Non-critical — continue without admin data
  }

  // Fetch member count
  let memberCount = 0;
  try {
    const countRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMemberCount`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: group.telegram_group_id }),
      }
    );
    const countData = await countRes.json();
    if (countData.ok) memberCount = countData.result;
  } catch {
    // Non-critical
  }

  // Update member count on group
  if (memberCount > 0) {
    await supabase
      .from("tg_groups")
      .update({ member_count: memberCount })
      .eq("id", group_id);
  }

  // Upsert admin members
  let synced = 0;
  for (const admin of admins) {
    const displayName = [admin.user.first_name, admin.user.last_name]
      .filter(Boolean)
      .join(" ");

    // Check existing record for message stats
    const { data: existing } = await supabase
      .from("tg_group_members")
      .select("message_count_7d, message_count_30d, last_message_at")
      .eq("group_id", group_id)
      .eq("telegram_user_id", admin.user.id)
      .single();

    const tier = existing
      ? computeEngagementTier(existing.message_count_7d, existing.message_count_30d, existing.last_message_at)
      : "new";

    const { error } = await supabase.from("tg_group_members").upsert(
      {
        group_id,
        telegram_user_id: admin.user.id,
        display_name: displayName,
        username: admin.user.username ?? null,
        role: admin.status, // creator, administrator
        engagement_tier: tier,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "group_id,telegram_user_id" }
    );

    if (!error) synced++;

    // Try to auto-link to CRM contact by telegram username
    if (admin.user.username) {
      const { data: contact } = await supabase
        .from("crm_contacts")
        .select("id")
        .eq("telegram_username", admin.user.username)
        .limit(1)
        .single();

      if (contact) {
        await supabase
          .from("tg_group_members")
          .update({ crm_contact_id: contact.id })
          .eq("group_id", group_id)
          .eq("telegram_user_id", admin.user.id);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    synced,
    memberCount,
    adminCount: admins.length,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id, is_flagged, flag_reason, crm_contact_id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (is_flagged !== undefined) {
    updates.is_flagged = is_flagged;
    updates.flag_reason = is_flagged ? (flag_reason ?? "Manually flagged") : null;
  }
  if (crm_contact_id !== undefined) {
    updates.crm_contact_id = crm_contact_id || null;
  }

  const { error } = await supabase
    .from("tg_group_members")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("[groups/members]", error.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
