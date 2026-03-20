import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { formatBroadcastMessage } from "@/lib/telegram-templates";
import { sendTelegramWithTracking } from "@/lib/telegram-send";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  const senderName =
    auth.user.user_metadata?.display_name ??
    auth.user.user_metadata?.full_name ??
    undefined;

  const { message, group_ids, slug, scheduled_at } = await request.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Resolve group IDs
  let targetGroupIds: string[] = group_ids ?? [];
  if (slug && !group_ids?.length) {
    const { data: slugGroups } = await supabase
      .from("tg_group_slugs")
      .select("group_id")
      .eq("slug", slug);
    targetGroupIds = (slugGroups ?? []).map((s: { group_id: string }) => s.group_id);
  }

  if (targetGroupIds.length === 0) {
    return NextResponse.json({ error: "No groups selected" }, { status: 400 });
  }

  // Fetch groups
  const { data: groups } = await supabase
    .from("tg_groups")
    .select("id, telegram_group_id, group_name")
    .in("id", targetGroupIds);

  if (!groups?.length) {
    return NextResponse.json({ error: "No valid groups found" }, { status: 404 });
  }

  const formattedMessage = formatBroadcastMessage(message.trim(), senderName);

  // Create broadcast record
  const isScheduled = scheduled_at && new Date(scheduled_at) > new Date();
  const { data: broadcast, error: broadcastErr } = await supabase
    .from("crm_broadcasts")
    .insert({
      message_text: message.trim(),
      message_html: formattedMessage,
      sender_id: auth.user.id,
      sender_name: senderName,
      slug_filter: slug ?? null,
      group_count: groups.length,
      status: isScheduled ? "scheduled" : "sending",
      scheduled_at: isScheduled ? scheduled_at : null,
    })
    .select()
    .single();

  if (broadcastErr || !broadcast) {
    console.error("[broadcasts/send] Failed to create broadcast record:", broadcastErr);
    return NextResponse.json({ error: "Failed to create broadcast" }, { status: 500 });
  }

  // Create recipient records
  const recipientRows = groups.map((g) => ({
    broadcast_id: broadcast.id,
    tg_group_id: g.id,
    group_name: g.group_name,
    telegram_group_id: g.telegram_group_id,
    status: isScheduled ? "pending" : "pending",
  }));
  await supabase.from("crm_broadcast_recipients").insert(recipientRows);

  // If scheduled, don't send now
  if (isScheduled) {
    return NextResponse.json({
      ok: true,
      broadcast_id: broadcast.id,
      scheduled: true,
      scheduled_at,
      total: groups.length,
    });
  }

  // Send immediately
  const results: { group_name: string; success: boolean; error?: string }[] = [];

  for (const group of groups) {
    const result = await sendTelegramWithTracking({
      chatId: group.telegram_group_id,
      text: formattedMessage,
      notificationType: "broadcast",
    });

    // Update recipient record
    await supabase
      .from("crm_broadcast_recipients")
      .update({
        status: result.success ? "sent" : "failed",
        tg_message_id: result.messageId ?? null,
        error: result.error ?? null,
        sent_at: result.success ? new Date().toISOString() : null,
      })
      .eq("broadcast_id", broadcast.id)
      .eq("tg_group_id", group.id);

    results.push({
      group_name: group.group_name,
      success: result.success,
      error: result.error,
    });
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  // Update broadcast totals
  await supabase
    .from("crm_broadcasts")
    .update({
      sent_count: sent,
      failed_count: failed,
      status: failed === groups.length ? "failed" : "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", broadcast.id);

  return NextResponse.json({
    ok: true,
    broadcast_id: broadcast.id,
    sent,
    failed,
    total: results.length,
    results,
  });
}
