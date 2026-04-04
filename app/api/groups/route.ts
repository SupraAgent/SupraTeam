import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/groups — List TG groups with server-side pagination.
 *
 * Query params:
 *   page       — page number (default 1)
 *   per_page   — results per page (default 50, max 200)
 *   search     — filter by group name (ilike)
 *   archived   — "true" to include archived, "only" for archived only (default: exclude)
 *   sort       — field to sort by (default: group_name)
 *   order      — asc or desc (default: asc)
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const rawPerPage = Number(searchParams.get("per_page") ?? 50);
  const perPage = Math.min(isNaN(rawPerPage) ? 50 : rawPerPage, 200);
  const search = searchParams.get("search");
  const archived = searchParams.get("archived");
  const sort = searchParams.get("sort") ?? "group_name";
  const order = searchParams.get("order") === "desc" ? false : true; // ascending by default

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("tg_groups")
    .select("*", { count: "exact" })
    .order(sort, { ascending: order })
    .range(from, to);

  // Archive filter
  if (archived === "only") {
    query = query.eq("is_archived", true);
  } else if (archived !== "true") {
    query = query.eq("is_archived", false);
  }

  // Search filter
  if (search) {
    query = query.ilike("group_name", `%${search}%`);
  }

  const { data: groups, error, count } = await query;

  if (error) {
    console.error("[api/groups] error:", error);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }

  return NextResponse.json({
    groups: groups ?? [],
    total: count ?? 0,
    page,
    per_page: perPage,
    total_pages: count ? Math.ceil(count / perPage) : 0,
  });
}
