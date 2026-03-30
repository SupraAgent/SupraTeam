import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { dispatchWebhook } from "@/lib/webhooks";
import { evaluateAssignment } from "@/lib/assignment";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, admin } = auth;

  const { searchParams } = new URL(request.url);
  const board = searchParams.get("board");
  const tgGroupId = searchParams.get("tg_group_id");
  const rawLimit = Number(searchParams.get("limit") ?? 100);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Math.min(isNaN(rawLimit) ? 100 : rawLimit, 500);
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  // Use scoped client — RLS filters to deals the user created, is assigned to, or is a lead
  let query = supabase
    .from("crm_deals")
    .select(`
      *,
      contact:crm_contacts(*),
      stage:pipeline_stages(*)
    `, { count: "exact" })
    .order("created_at", { ascending: false });

  if (board && board !== "All") {
    query = query.eq("board_type", board);
  }

  if (tgGroupId) {
    query = query.eq("tg_group_id", tgGroupId);
  }

  query = query.range(offset, offset + limit - 1);

  const { data: deals, error, count } = await query;

  if (error) {
    console.error("[api/deals] error:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }

  // Fetch assigned profiles via admin (profiles table is shared, not CRM-scoped)
  const assignedIds = [...new Set((deals ?? []).map((d) => d.assigned_to).filter(Boolean))];
  let profileMap: Record<string, { display_name: string; avatar_url: string }> = {};

  if (assignedIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", assignedIds);

    if (profiles) {
      for (const p of profiles) {
        profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      }
    }
  }

  const enriched = (deals ?? []).map((d) => ({
    ...d,
    assigned_profile: d.assigned_to ? profileMap[d.assigned_to] ?? null : null,
  }));

  return NextResponse.json({ deals: enriched, total: count ?? 0, limit, offset, source: "supabase" });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { deal_name, board_type, stage_id, contact_id, assigned_to, value, probability, telegram_chat_id, telegram_chat_name, telegram_chat_link, custom_fields } = body as Record<string, unknown>;

  if (!deal_name || !board_type || !stage_id) {
    return NextResponse.json({ error: "deal_name, board_type, and stage_id are required" }, { status: 400 });
  }

  if (!["BD", "Marketing", "Admin", "Applications"].includes(board_type as string)) {
    return NextResponse.json({ error: "board_type must be BD, Marketing, Admin, or Applications" }, { status: 400 });
  }

  // Use scoped client — RLS INSERT policy allows any authenticated user
  const { data: deal, error } = await supabase
    .from("crm_deals")
    .insert({
      deal_name,
      board_type,
      stage_id,
      contact_id: contact_id ?? null,
      assigned_to: assigned_to ?? null,
      value: value ?? null,
      probability: probability ?? null,
      telegram_chat_id: telegram_chat_id ?? null,
      telegram_chat_name: telegram_chat_name ?? null,
      telegram_chat_link: telegram_chat_link ?? null,
      created_by: user.id,
      stage_changed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[api/deals] insert error:", error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }

  // Save custom field values via scoped client
  if (custom_fields && typeof custom_fields === "object" && deal) {
    const fieldValues = Object.entries(custom_fields)
      .filter(([, v]) => v)
      .map(([fieldId, val]) => ({
        deal_id: deal.id,
        field_id: fieldId,
        value: String(val),
      }));

    if (fieldValues.length > 0) {
      await supabase.from("crm_deal_field_values").insert(fieldValues);
    }
  }

  // Auto-assign via rules engine if no manual assignment was provided
  if (deal && !deal.assigned_to) {
    try {
      // Fetch group slugs via two-step lookup (deal stores TG chat ID, slugs reference group UUID)
      let groupSlugs: string[] = [];
      if (deal.telegram_chat_id) {
        const { data: group } = await supabase
          .from("tg_groups")
          .select("id")
          .eq("telegram_group_id", String(deal.telegram_chat_id))
          .single();

        if (group) {
          const { data: slugRows } = await supabase
            .from("tg_group_slugs")
            .select("slug")
            .eq("group_id", group.id);
          groupSlugs = (slugRows ?? []).map((r: { slug: string }) => r.slug);
        }
      }

      const result = await evaluateAssignment(supabase, {
        chatId: deal.telegram_chat_id ? Number(deal.telegram_chat_id) : 0,
        messageText: deal.deal_name,
        senderTelegramId: 0,
        groupSlugs,
      });

      if (result) {
        await supabase
          .from("crm_deals")
          .update({ assigned_to: result.userId, assignment_reason: result.reason })
          .eq("id", deal.id);
        deal.assigned_to = result.userId;
        deal.assignment_reason = result.reason;
      }
    } catch (err) {
      console.error("[api/deals] auto-assign error:", err);
    }
  }

  // Fire webhook (non-blocking)
  if (deal) {
    dispatchWebhook("deal.created", { deal_id: deal.id, deal_name: deal.deal_name, board_type: deal.board_type, stage_id: deal.stage_id, value: deal.value }).catch(() => {});
  }

  // Trigger deal_created automations (non-blocking)
  if (deal) {
    evaluateAutomationRules({
      type: "deal_created",
      dealId: deal.id,
      payload: {
        deal_name: deal.deal_name,
        board_type: deal.board_type,
        stage_id: deal.stage_id,
        value: deal.value,
        created_by: user.id,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ deal, ok: true });
}
