import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  if (!q || q.length < 2) return NextResponse.json({ deals: [], contacts: [], groups: [] });

  const pattern = `%${q}%`;

  const [dealsRes, contactsRes, groupsRes] = await Promise.all([
    supabase
      .from("crm_deals")
      .select("id, deal_name, board_type, stage:pipeline_stages(name, color)")
      .ilike("deal_name", pattern)
      .limit(5),
    supabase
      .from("crm_contacts")
      .select("id, name, company, telegram_username")
      .or(`name.ilike.${pattern},company.ilike.${pattern},telegram_username.ilike.${pattern}`)
      .limit(5),
    supabase
      .from("tg_groups")
      .select("id, group_name")
      .ilike("group_name", pattern)
      .limit(3),
  ]);

  return NextResponse.json({
    deals: dealsRes.data ?? [],
    contacts: contactsRes.data ?? [],
    groups: groupsRes.data ?? [],
  });
}
