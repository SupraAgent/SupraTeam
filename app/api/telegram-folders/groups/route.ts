import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** Returns groups + telegram IDs for a given slug. Used by browser to build folder peers. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug query param is required" }, { status: 400 });
  }

  // Get group IDs for this slug
  const { data: slugEntries, error: slugError } = await supabase
    .from("tg_group_slugs")
    .select("group_id")
    .eq("slug", slug);

  if (slugError) {
    console.error("[api/telegram-folders/groups] slug error:", slugError);
    return NextResponse.json({ error: "Failed to fetch slug groups" }, { status: 500 });
  }

  if (!slugEntries?.length) {
    return NextResponse.json({ groups: [] });
  }

  const groupIds = slugEntries.map((s) => s.group_id);

  const { data: groups, error: groupError } = await supabase
    .from("tg_groups")
    .select("id, telegram_group_id, group_name, group_type")
    .in("id", groupIds);

  if (groupError) {
    console.error("[api/telegram-folders/groups] group error:", groupError);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }

  return NextResponse.json({ groups: groups ?? [] });
}
