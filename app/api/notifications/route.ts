import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const unreadOnly = searchParams.get("unread") === "true";

  let query = supabase
    .from("crm_notifications")
    .select(`
      *,
      deal:crm_deals(id, deal_name, board_type, stage_id, stage:pipeline_stages(name, color)),
      contact:crm_contacts(id, name, telegram_username),
      tg_group:tg_groups(id, group_name, group_url)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  const { data: notifications, error } = await query;

  if (error) {
    console.error("[api/notifications] error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }

  // Get unread count
  const { count } = await supabase
    .from("crm_notifications")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false);

  return NextResponse.json({
    notifications: notifications ?? [],
    unread_count: count ?? 0,
  });
}

// Create a notification (used by bot webhook)
export async function POST(request: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json();
  const { type, deal_id, contact_id, tg_group_id, title, body: notifBody, tg_deep_link, tg_sender_name, pipeline_link } = body;

  if (!type || !title) {
    return NextResponse.json({ error: "type and title are required" }, { status: 400 });
  }

  const { data: notification, error } = await supabase
    .from("crm_notifications")
    .insert({
      type,
      deal_id: deal_id || null,
      contact_id: contact_id || null,
      tg_group_id: tg_group_id || null,
      title,
      body: notifBody || null,
      tg_deep_link: tg_deep_link || null,
      tg_sender_name: tg_sender_name || null,
      pipeline_link: pipeline_link || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/notifications] insert error:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }

  return NextResponse.json({ notification, ok: true });
}

// Mark notifications as read
export async function PATCH(request: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { ids, mark_all } = await request.json();

  if (mark_all) {
    await supabase
      .from("crm_notifications")
      .update({ is_read: true })
      .eq("is_read", false);
  } else if (Array.isArray(ids) && ids.length > 0) {
    await supabase
      .from("crm_notifications")
      .update({ is_read: true })
      .in("id", ids);
  }

  return NextResponse.json({ ok: true });
}
