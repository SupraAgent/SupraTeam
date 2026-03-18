import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  const { message, group_ids, slug } = await request.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Resolve group IDs from slug or direct selection
  let targetGroupIds: string[] = group_ids ?? [];

  if (slug && !group_ids?.length) {
    const { data: slugGroups } = await supabase
      .from("tg_group_slugs")
      .select("group_id")
      .eq("slug", slug);
    targetGroupIds = (slugGroups ?? []).map((s) => s.group_id);
  }

  if (targetGroupIds.length === 0) {
    return NextResponse.json({ error: "No groups selected" }, { status: 400 });
  }

  // Fetch telegram_group_id for each group
  const { data: groups } = await supabase
    .from("tg_groups")
    .select("id, telegram_group_id, group_name")
    .in("id", targetGroupIds);

  if (!groups?.length) {
    return NextResponse.json({ error: "No valid groups found" }, { status: 404 });
  }

  // Send message to each group
  const results: { group_name: string; success: boolean; error?: string }[] = [];

  for (const group of groups) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: group.telegram_group_id,
          text: message.trim(),
          parse_mode: "HTML",
        }),
      });

      const data = await res.json();
      results.push({
        group_name: group.group_name,
        success: data.ok === true,
        error: data.ok ? undefined : data.description,
      });
    } catch (err) {
      results.push({
        group_name: group.group_name,
        success: false,
        error: String(err),
      });
    }
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    total: results.length,
    results,
  });
}
