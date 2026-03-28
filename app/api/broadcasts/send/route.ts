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

  const { message, variant_b_message, group_ids, slug, scheduled_at, suppression_hours, exclude_stage_ids } = await request.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Check if user is admin — admins can broadcast to any group
  const { data: profile } = await supabase
    .from("profiles")
    .select("crm_role")
    .eq("id", auth.user.id)
    .single();

  const isAdmin = profile?.crm_role === "admin_lead";

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

  // Non-admin users: verify slug access for target groups
  if (!isAdmin) {
    const { data: userSlugs } = await supabase
      .from("crm_user_slug_access")
      .select("slug")
      .eq("user_id", auth.user.id);

    const allowedSlugs = new Set((userSlugs ?? []).map((s: { slug: string }) => s.slug));

    // Get slugs for target groups
    const { data: groupSlugs } = await supabase
      .from("tg_group_slugs")
      .select("group_id, slug")
      .in("group_id", targetGroupIds);

    // Filter to only groups the user has slug access to
    const groupsWithAccess = new Set<string>();
    for (const gs of groupSlugs ?? []) {
      if (allowedSlugs.has(gs.slug)) {
        groupsWithAccess.add(gs.group_id);
      }
    }

    targetGroupIds = targetGroupIds.filter((id) => groupsWithAccess.has(id));
    if (targetGroupIds.length === 0) {
      return NextResponse.json({ error: "No access to selected groups" }, { status: 403 });
    }
  }

  // Fetch groups
  const { data: allGroups } = await supabase
    .from("tg_groups")
    .select("id, telegram_group_id, group_name")
    .in("id", targetGroupIds);

  if (!allGroups?.length) {
    return NextResponse.json({ error: "No valid groups found" }, { status: 404 });
  }

  // Apply suppression rules
  let groups = allGroups;
  const effectiveSuppression = suppression_hours ?? null;
  const effectiveExcludeStages: string[] = exclude_stage_ids ?? [];

  if (effectiveSuppression && effectiveSuppression > 0) {
    // Exclude groups that received a broadcast within the suppression window
    const cutoff = new Date(Date.now() - effectiveSuppression * 3600000).toISOString();
    const { data: recentRecipients } = await supabase
      .from("crm_broadcast_recipients")
      .select("tg_group_id")
      .eq("status", "sent")
      .gte("sent_at", cutoff)
      .limit(2000);

    const recentGroupIds = new Set((recentRecipients ?? []).map((r: { tg_group_id: string }) => r.tg_group_id));
    groups = groups.filter((g) => !recentGroupIds.has(g.id));
  }

  if (effectiveExcludeStages.length > 0) {
    // Exclude groups linked to deals at excluded stages
    const groupIds = groups.map((g) => g.id);
    const { data: excludedDeals } = await supabase
      .from("crm_deals")
      .select("tg_group_id")
      .in("tg_group_id", groupIds)
      .in("stage_id", effectiveExcludeStages)
      .eq("outcome", "open");

    const excludedGroupIds = new Set((excludedDeals ?? []).map((d: { tg_group_id: string }) => d.tg_group_id));
    groups = groups.filter((g) => !excludedGroupIds.has(g.id));
  }

  if (groups.length === 0) {
    return NextResponse.json({ error: "All groups filtered by suppression rules", suppressed: allGroups.length }, { status: 200 });
  }

  const formattedMessage = formatBroadcastMessage(message.trim(), senderName);
  const hasVariantB = variant_b_message?.trim();
  const formattedVariantB = hasVariantB ? formatBroadcastMessage(variant_b_message.trim(), senderName) : null;

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
      variant_b_message: hasVariantB ? variant_b_message.trim() : null,
      suppression_hours: effectiveSuppression,
      exclude_stage_ids: effectiveExcludeStages.length > 0 ? effectiveExcludeStages : null,
    })
    .select()
    .single();

  if (broadcastErr || !broadcast) {
    console.error("[broadcasts/send] Failed to create broadcast record:", broadcastErr);
    return NextResponse.json({ error: "Failed to create broadcast" }, { status: 500 });
  }

  // Create recipient records with A/B variant assignment (shuffle for randomness)
  const shuffled = [...groups].sort(() => Math.random() - 0.5);
  const halfPoint = Math.ceil(shuffled.length / 2);
  const recipientRows = shuffled.map((g, i) => ({
    broadcast_id: broadcast.id,
    tg_group_id: g.id,
    group_name: g.group_name,
    telegram_group_id: g.telegram_group_id,
    status: "pending",
    variant: hasVariantB ? (i < halfPoint ? "A" : "B") : null,
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

  // Send immediately — use variant B message for B recipients
  const results: { group_name: string; success: boolean; error?: string }[] = [];
  const variantMap = new Map(recipientRows.map((r) => [r.tg_group_id, r.variant]));

  for (const group of groups) {
    const variant = variantMap.get(group.id);
    const msgToSend = (variant === "B" && formattedVariantB) ? formattedVariantB : formattedMessage;

    const result = await sendTelegramWithTracking({
      chatId: group.telegram_group_id,
      text: msgToSend,
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
        delivery_attempts: 1,
        last_attempt_at: new Date().toISOString(),
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
