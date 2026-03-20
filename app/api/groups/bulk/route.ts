import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { action, group_ids, slug, bot_id } = await request.json();

  if (!action || !Array.isArray(group_ids) || group_ids.length === 0) {
    return NextResponse.json(
      { error: "action and non-empty group_ids[] required" },
      { status: 400 }
    );
  }

  const results: { group_id: string; ok: boolean; error?: string }[] = [];

  if (action === "assign_slug") {
    if (!slug) {
      return NextResponse.json({ error: "slug required for assign_slug" }, { status: 400 });
    }
    const rows = group_ids.map((gid: string) => ({
      group_id: gid,
      slug: slug.toLowerCase().trim(),
    }));
    const { error } = await supabase
      .from("tg_group_slugs")
      .upsert(rows, { onConflict: "group_id,slug", ignoreDuplicates: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const gid of group_ids) results.push({ group_id: gid, ok: true });
  } else if (action === "remove_slug") {
    if (!slug) {
      return NextResponse.json({ error: "slug required for remove_slug" }, { status: 400 });
    }
    for (const gid of group_ids) {
      const { error } = await supabase
        .from("tg_group_slugs")
        .delete()
        .eq("group_id", gid)
        .eq("slug", slug);
      results.push({ group_id: gid, ok: !error, error: error?.message });
    }
  } else if (action === "archive") {
    const { error } = await supabase
      .from("tg_groups")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .in("id", group_ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const gid of group_ids) results.push({ group_id: gid, ok: true });
  } else if (action === "unarchive") {
    const { error } = await supabase
      .from("tg_groups")
      .update({ is_archived: false, archived_at: null })
      .in("id", group_ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const gid of group_ids) results.push({ group_id: gid, ok: true });
  } else if (action === "assign_bot") {
    if (!bot_id) {
      return NextResponse.json({ error: "bot_id required for assign_bot" }, { status: 400 });
    }
    const { error } = await supabase
      .from("tg_groups")
      .update({ bot_id, updated_at: new Date().toISOString() })
      .in("id", group_ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const gid of group_ids) results.push({ group_id: gid, ok: true });
  } else if (action === "refresh_status") {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
    }
    // Fetch groups to get telegram_group_id
    const { data: groups } = await supabase
      .from("tg_groups")
      .select("id, telegram_group_id")
      .in("id", group_ids);

    for (const g of groups ?? []) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/getChat?chat_id=${g.telegram_group_id}`
        );
        const data = await res.json();
        if (data.ok) {
          const chat = data.result;
          await supabase
            .from("tg_groups")
            .update({
              group_name: chat.title ?? undefined,
              member_count:
                chat.member_count ?? undefined,
              last_bot_check_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", g.id);
          results.push({ group_id: g.id, ok: true });
        } else {
          results.push({ group_id: g.id, ok: false, error: data.description });
        }
      } catch (err) {
        results.push({
          group_id: g.id,
          ok: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
    // Also update last_bot_check_at for admin status verification
    const now = new Date().toISOString();
    await supabase
      .from("tg_groups")
      .update({ last_bot_check_at: now })
      .in("id", group_ids);
  } else {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    action,
    affected: results.filter((r) => r.ok).length,
    total: group_ids.length,
    results,
  });
}
