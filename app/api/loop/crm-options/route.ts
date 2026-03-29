import { NextResponse } from "next/server";
import { requireLeadRole } from "@/lib/auth-guard";

/** Strip characters that could break PostgREST filter syntax */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[%(),.*\\:"']/g, "").trim().slice(0, 100);
}

/**
 * GET: Fetch CRM entity options for Loop Builder dropdowns.
 *
 * Query params:
 *   type = "stages" | "contacts" | "deals" | "groups" | "team" | "boards"
 *   board = board_type filter (for stages)
 *   search = text search (for contacts/deals)
 */
export async function GET(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  if (!type) {
    return NextResponse.json({ error: "type parameter required" }, { status: 400 });
  }

  switch (type) {
    case "stages": {
      const board = url.searchParams.get("board");
      let query = admin.from("pipeline_stages").select("id, name, position, color, board_type").order("position");
      if (board) query = query.eq("board_type", board);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ options: data?.map((s) => ({ value: s.id, label: `${s.name} (${s.board_type})`, meta: s })) ?? [] });
    }

    case "contacts": {
      const search = sanitizeSearch(url.searchParams.get("search") || "");
      let query = admin.from("crm_contacts").select("id, name, company, telegram_username").order("name").limit(50);
      if (search) query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,telegram_username.ilike.%${search}%`);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ options: data?.map((c) => ({ value: c.id, label: c.name || c.telegram_username || "Unknown", meta: { company: c.company } })) ?? [] });
    }

    case "deals": {
      const search = sanitizeSearch(url.searchParams.get("search") || "");
      let query = admin.from("crm_deals").select("id, deal_name, board_type, value").order("updated_at", { ascending: false }).limit(50);
      if (search) query = query.ilike("deal_name", `%${search}%`);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ options: data?.map((d) => ({ value: d.id, label: d.deal_name, meta: { board: d.board_type, value: d.value } })) ?? [] });
    }

    case "groups": {
      const { data, error } = await admin.from("tg_groups").select("id, telegram_group_id, group_name, group_type").order("group_name");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ options: data?.map((g) => ({ value: g.telegram_group_id, label: g.group_name || `Group ${g.telegram_group_id}`, meta: { type: g.group_type } })) ?? [] });
    }

    case "team": {
      const { data, error } = await admin.from("profiles").select("id, display_name, github_username, avatar_url, crm_role");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ options: data?.map((p) => ({ value: p.id, label: p.display_name || p.github_username || "Unknown", meta: { role: p.crm_role, avatar: p.avatar_url } })) ?? [] });
    }

    case "boards": {
      return NextResponse.json({
        options: [
          { value: "BD", label: "BD Board" },
          { value: "Marketing", label: "Marketing Board" },
          { value: "Admin", label: "Admin Board" },
          { value: "Applications", label: "Applications Board" },
        ],
      });
    }

    case "sequences": {
      const { data, error } = await admin.from("crm_outreach_sequences").select("id, name, status, channel").order("name");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        options: (data ?? []).map((s) => ({
          value: s.id,
          label: `${s.name} (${s.channel})`,
          meta: { status: s.status },
        })),
      });
    }

    case "slugs": {
      const { data, error } = await admin.from("tg_group_slugs").select("slug").order("slug");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const unique = [...new Set((data ?? []).map((s) => s.slug))];
      return NextResponse.json({
        options: unique.map((s) => ({ value: s, label: s })),
      });
    }

    default:
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  }
}
