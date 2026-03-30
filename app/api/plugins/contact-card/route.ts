import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET /api/plugins/contact-card?email=foo@bar.com
 *  Returns CRM contact + linked deals for a given email address.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "email param required" }, { status: 400 });
  }

  // Find contact by email
  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("id, name, email, phone, company, title, telegram_username, telegram_user_id, x_handle, lifecycle_stage, quality_score, engagement_score, source, created_at, updated_at")
    .eq("email", email)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ data: null });
  }

  // Get deals for this contact
  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, value, outcome, stage_id, last_activity_at, pipeline_stages(id, name, color)")
    .eq("contact_id", contact.id)
    .order("updated_at", { ascending: false })
    .limit(5);

  // Get TG groups the contact is in (via telegram_user_id membership)
  const { data: groups } = contact.telegram_user_id
    ? await supabase
        .from("tg_groups")
        .select("id, group_name, group_type, member_count")
        .contains("member_ids", [contact.telegram_user_id])
        .limit(5)
    : { data: [] };

  // Last interaction (most recent deal activity)
  const lastTouchpoint = deals?.[0]?.last_activity_at ?? contact.updated_at;

  return NextResponse.json({
    data: {
      contact,
      deals: deals ?? [],
      groups: groups ?? [],
      lastTouchpoint,
    },
  });
}
