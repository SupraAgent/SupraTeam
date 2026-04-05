import { NextResponse } from "next/server";
import { requireApiKey, isError } from "@/lib/api-key-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireApiKey(request, "read");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? 50);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200);
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  // Scope to groups the API key owner has access to via slug access control
  const { data: accessibleGroupIds } = await admin
    .from("crm_user_slug_access")
    .select("slug_id")
    .eq("user_id", auth.userId);

  const slugIds = (accessibleGroupIds ?? []).map((a) => a.slug_id);

  let query = admin
    .from("tg_groups")
    .select("id, group_name, telegram_group_id, member_count, is_archived, created_at", {
      count: "exact",
    })
    .order("group_name")
    .range(offset, offset + limit - 1);

  // If user has slug-based access, filter to those groups; otherwise show only groups they created
  if (slugIds.length > 0) {
    const { data: groupIds } = await admin
      .from("tg_group_slugs")
      .select("group_id")
      .in("slug_id", slugIds);
    const ids = (groupIds ?? []).map((g) => g.group_id);
    if (ids.length > 0) {
      query = query.in("id", ids);
    } else {
      query = query.eq("created_by", auth.userId);
    }
  } else {
    query = query.eq("created_by", auth.userId);
  }

  const { data: groups, error, count } = await query;

  if (error) {
    console.error("[api/v1/groups] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: groups ?? [],
    meta: { total: count ?? 0, limit, offset },
  });
}
