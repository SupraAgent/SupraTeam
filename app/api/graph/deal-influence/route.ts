import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { computeInfluenceScore } from "@/lib/graph/influence-scoring";
import type { GraphNode, GraphEdge } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const dealId = searchParams.get("deal_id");
  const timeFrom = searchParams.get("time_from");
  const timeTo = searchParams.get("time_to");

  if (!dealId) {
    return NextResponse.json({ error: "deal_id is required" }, { status: 400 });
  }

  // 1. Fetch deal with stage
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, value, tg_group_id, contact_id, assigned_to, created_by, stage:pipeline_stages(name, color)")
    .eq("id", dealId)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Ownership check: user must be assigned_to, created_by, or a lead
  const isOwner = deal.assigned_to === user.id || deal.created_by === user.id;
  if (!isOwner) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("crm_role")
      .eq("id", user.id)
      .single();
    const LEAD_ROLES = ["bd_lead", "marketing_lead", "admin_lead"];
    if (!profile?.crm_role || !LEAD_ROLES.includes(profile.crm_role)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  // 2. Fetch participants with contacts
  const { data: participants } = await supabase
    .from("crm_deal_participants")
    .select("*, contact:crm_contacts(id, name, company, telegram_username, telegram_user_id)")
    .eq("deal_id", dealId);
  const partList = participants ?? [];

  // 3. Fetch stage history
  let stageQuery = supabase
    .from("crm_deal_stage_history")
    .select("id, from_stage_id, to_stage_id, changed_by, changed_at, to_stage:pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name)")
    .eq("deal_id", dealId)
    .order("changed_at", { ascending: true });
  if (timeFrom) stageQuery = stageQuery.gte("changed_at", timeFrom);
  if (timeTo) stageQuery = stageQuery.lte("changed_at", timeTo);
  const { data: stageHistory } = await stageQuery;

  // 4. Fetch highlights for this deal
  let highlightQuery = supabase
    .from("crm_highlights")
    .select("id, contact_id, tg_group_id, highlight_type, created_at")
    .eq("deal_id", dealId);
  if (timeFrom) highlightQuery = highlightQuery.gte("created_at", timeFrom);
  if (timeTo) highlightQuery = highlightQuery.lte("created_at", timeTo);
  const { data: highlights } = await highlightQuery;

  // 5. Fetch outreach enrollments
  const { data: enrollments } = await supabase
    .from("crm_outreach_enrollments")
    .select("id, contact_id, status")
    .eq("deal_id", dealId);

  // 6. Fetch group members if deal has a linked group
  let groupMembers: { crm_contact_id: string; message_count_30d: number; engagement_tier: string; last_message_at: string | null }[] = [];
  if (deal.tg_group_id) {
    const { data: gm } = await supabase
      .from("tg_group_members")
      .select("crm_contact_id, message_count_30d, engagement_tier, last_message_at")
      .eq("group_id", deal.tg_group_id)
      .not("crm_contact_id", "is", null);
    groupMembers = gm ?? [];
  }

  // 7. Fetch linked docs
  const { data: docLinks } = await supabase
    .from("crm_doc_links")
    .select("doc_id, entity_type, entity_id")
    .eq("entity_type", "deal")
    .eq("entity_id", dealId);

  const docIds = (docLinks ?? []).map((l: { doc_id: string }) => l.doc_id);
  const { data: docs } = docIds.length > 0
    ? await supabase.from("crm_docs").select("id, title, updated_at").in("id", docIds)
    : { data: [] };

  // --- Compute influence scores ---
  const maxMsg = groupMembers.reduce((max, m) => Math.max(max, m.message_count_30d ?? 0), 1);
  const contactIdToMember = new Map(groupMembers.map((m) => [m.crm_contact_id, m]));

  // changed_by is auth.users UUID; contact_id is crm_contacts UUID. We need to
  // bridge via profiles.telegram_username → crm_contacts.telegram_username to map
  // stage changes to the correct contact. Build a user→contact lookup first.
  const contactTelegramMap = new Map<string, string>(); // telegram_username → contact_id
  for (const p of partList) {
    const tg = p.contact?.telegram_username;
    if (tg) contactTelegramMap.set(tg.toLowerCase(), p.contact!.id);
  }
  // Fetch profiles for users who changed stages to get their telegram usernames
  const changerUserIds = [...new Set((stageHistory ?? []).map((sh: { changed_by: string | null }) => sh.changed_by).filter(Boolean))] as string[];
  const userToContactId = new Map<string, string>();
  if (changerUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, telegram_username")
      .in("id", changerUserIds);
    for (const prof of profiles ?? []) {
      if (prof.telegram_username) {
        const contactId = contactTelegramMap.get(prof.telegram_username.toLowerCase());
        if (contactId) userToContactId.set(prof.id, contactId);
      }
    }
  }
  const stageChangesPerContact = new Map<string, number>();
  for (const sh of stageHistory ?? []) {
    if (sh.changed_by) {
      const contactId = userToContactId.get(sh.changed_by);
      if (contactId) {
        stageChangesPerContact.set(contactId, (stageChangesPerContact.get(contactId) ?? 0) + 1);
      }
    }
  }

  const highlightsPerContact = new Map<string, number>();
  for (const h of highlights ?? []) {
    if (h.contact_id) {
      highlightsPerContact.set(h.contact_id, (highlightsPerContact.get(h.contact_id) ?? 0) + 1);
    }
  }

  const outreachReplied = new Set<string>();
  for (const e of enrollments ?? []) {
    if (e.status === "replied" && e.contact_id) {
      outreachReplied.add(e.contact_id);
    }
  }

  // Build nodes & edges
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const timeline: { date: string; event_type: string; description: string; contact_id?: string }[] = [];

  // Deal node (center)
  nodes.push({
    id: deal.id,
    type: "deal",
    label: deal.deal_name,
    meta: { board_type: deal.board_type, value: deal.value, stage: deal.stage },
  });

  // Participant nodes
  for (const p of partList) {
    const contact = p.contact;
    if (!contact) continue;

    const member = contactIdToMember.get(contact.id);
    const msgCount = member?.message_count_30d ?? 0;
    const lastActivity = member?.last_message_at;
    const daysSince = lastActivity
      ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
      : 999;

    const score = computeInfluenceScore({
      stageChangesAttributed: stageChangesPerContact.get(contact.id) ?? 0,
      messageCount30d: msgCount,
      maxMessageCount30dInGroup: maxMsg,
      highlightCount: highlightsPerContact.get(contact.id) ?? 0,
      hasOutreachReply: outreachReplied.has(contact.id),
      daysSinceLastInteraction: daysSince,
    });

    nodes.push({
      id: contact.id,
      type: "contact",
      label: contact.name,
      meta: {
        company: contact.company,
        role: p.role,
        influence_score: score,
        engagement_tier: member?.engagement_tier ?? "unknown",
      },
    });

    edges.push({
      source: contact.id,
      target: deal.id,
      type: "participant",
      strength: score,
      label: p.role,
    });
  }

  // Deal → group edge
  if (deal.tg_group_id) {
    const { data: group } = await supabase
      .from("tg_groups")
      .select("id, group_name, group_type, member_count")
      .eq("id", deal.tg_group_id)
      .single();

    if (group) {
      nodes.push({
        id: group.id,
        type: "group",
        label: group.group_name,
        meta: { group_type: group.group_type, member_count: group.member_count },
      });
      edges.push({ source: deal.id, target: group.id, type: "deal_group" });
    }
  }

  // Doc nodes
  for (const doc of docs ?? []) {
    nodes.push({
      id: doc.id,
      type: "doc",
      label: doc.title,
      meta: { updated_at: doc.updated_at },
    });
    edges.push({ source: doc.id, target: deal.id, type: "doc_deal" });
  }

  // Build timeline
  for (const sh of stageHistory ?? []) {
    const toStage = sh.to_stage as unknown as { name: string } | null;
    const stageName = toStage?.name ?? "Unknown";
    timeline.push({
      date: sh.changed_at,
      event_type: "stage_change",
      description: `Moved to ${stageName}`,
      contact_id: sh.changed_by ?? undefined,
    });
  }

  for (const h of highlights ?? []) {
    timeline.push({
      date: h.created_at,
      event_type: "highlight",
      description: `${h.highlight_type} highlight`,
      contact_id: h.contact_id ?? undefined,
    });
  }

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({
    deal: { id: deal.id, name: deal.deal_name, stage: deal.stage, value: deal.value },
    nodes,
    edges,
    timeline,
    source: "supabase",
  });
}
