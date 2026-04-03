import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  computeRelationshipStrength,
  type ContactPairData,
} from "@/lib/graph/relationship-strength";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GraphNode, GraphEdge } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "explorer";
  const types = searchParams.get("types")?.split(",") ?? ["deal", "contact", "group", "doc"];
  const board = searchParams.get("board");

  if (mode === "relationships") {
    return handleRelationshipsMode(supabase, searchParams);
  }

  // --- Default explorer mode ---
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  if (types.includes("deal")) {
    let query = supabase
      .from("crm_deals")
      .select("id, deal_name, board_type, stage_id, value, contact_id, tg_group_id, stage:pipeline_stages(name, color)");
    if (board && board !== "All") query = query.eq("board_type", board);
    const { data: deals } = await query;
    for (const d of deals ?? []) {
      nodes.push({ id: d.id, type: "deal", label: d.deal_name, meta: { board_type: d.board_type, value: d.value, stage: d.stage } });
      nodeIds.add(d.id);
      if (d.contact_id) edges.push({ source: d.id, target: d.contact_id, type: "deal_contact" });
      if (d.tg_group_id) edges.push({ source: d.id, target: d.tg_group_id, type: "deal_group" });
    }
  }

  if (types.includes("contact")) {
    const { data: contacts } = await supabase.from("crm_contacts").select("id, name, company, telegram_username");
    for (const c of contacts ?? []) {
      nodes.push({ id: c.id, type: "contact", label: c.name, meta: { company: c.company, telegram: c.telegram_username } });
      nodeIds.add(c.id);
    }
  }

  if (types.includes("group")) {
    const { data: groups } = await supabase.from("tg_groups").select("id, group_name, group_type, member_count");
    for (const g of groups ?? []) {
      nodes.push({ id: g.id, type: "group", label: g.group_name, meta: { group_type: g.group_type, member_count: g.member_count } });
      nodeIds.add(g.id);
    }
  }

  if (types.includes("doc")) {
    const { data: docs } = await supabase.from("crm_docs").select("id, title, updated_at");
    for (const d of docs ?? []) {
      nodes.push({ id: d.id, type: "doc", label: d.title, meta: { updated_at: d.updated_at } });
      nodeIds.add(d.id);
    }
    const { data: docLinks } = await supabase.from("crm_doc_links").select("doc_id, entity_type, entity_id");
    for (const link of docLinks ?? []) {
      if (nodeIds.has(link.doc_id) && nodeIds.has(link.entity_id)) {
        edges.push({ source: link.doc_id, target: link.entity_id, type: `doc_${link.entity_type}` });
      }
    }
  }

  const validEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  return NextResponse.json({ nodes, edges: validEdges, source: "supabase" });
}

// ---- Relationships Mode ----

interface GroupMember {
  crm_contact_id: string;
  group_id: string;
  engagement_tier: string | null;
  message_count_30d: number | null;
  last_message_at: string | null;
}

const MAX_CRM_MEMBERS_PER_GROUP = 50;

async function handleRelationshipsMode(supabase: SupabaseClient, searchParams: URLSearchParams) {
  const pathFrom = searchParams.get("path_from");
  const pathTo = searchParams.get("path_to");

  const { data: contacts } = await supabase.from("crm_contacts").select("id, name, company, telegram_username, engagement_score");
  const contactList = contacts ?? [];

  const { data: explicitRels } = await supabase.from("crm_contact_relationships").select("*");
  const rels = explicitRels ?? [];

  const { data: memberships } = await supabase.from("tg_group_members").select("crm_contact_id, group_id, engagement_tier, message_count_30d, last_message_at").not("crm_contact_id", "is", null);
  const members: GroupMember[] = memberships ?? [];

  const groupIds = [...new Set(members.map((m) => m.group_id))];
  const { data: groups } = groupIds.length > 0
    ? await supabase.from("tg_groups").select("id, group_name, group_type, member_count").in("id", groupIds)
    : { data: [] };

  const { data: dealParticipants } = await supabase.from("crm_deal_participants").select("deal_id, contact_id");
  const dpList: { deal_id: string; contact_id: string }[] = dealParticipants ?? [];

  const dealContactMap = new Map<string, Set<string>>();
  for (const dp of dpList) {
    if (!dealContactMap.has(dp.deal_id)) dealContactMap.set(dp.deal_id, new Set());
    dealContactMap.get(dp.deal_id)!.add(dp.contact_id);
  }

  const groupMemberMap = new Map<string, GroupMember[]>();
  for (const m of members) {
    if (!groupMemberMap.has(m.group_id)) groupMemberMap.set(m.group_id, []);
    groupMemberMap.get(m.group_id)!.push(m);
  }

  const pairMap = new Map<string, {
    sharedGroupCount: number;
    sharedDealCount: number;
    msgPairs: { a: number; b: number }[];
    mostRecentDaysAgo: number;
    hasExplicit: boolean;
    explicitType?: string;
  }>();

  const pairKey = (a: string, b: string) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const contactIdSet = new Set(contactList.map((c: { id: string }) => c.id));

  for (const [, groupMembers] of groupMemberMap) {
    const crmMembers = groupMembers.filter((m) => contactIdSet.has(m.crm_contact_id))
      .slice(0, MAX_CRM_MEMBERS_PER_GROUP); // Cap O(n²) pair generation
    for (let i = 0; i < crmMembers.length; i++) {
      for (let j = i + 1; j < crmMembers.length; j++) {
        const a = crmMembers[i];
        const b = crmMembers[j];
        const key = pairKey(a.crm_contact_id, b.crm_contact_id);
        if (!pairMap.has(key)) pairMap.set(key, { sharedGroupCount: 0, sharedDealCount: 0, msgPairs: [], mostRecentDaysAgo: Infinity, hasExplicit: false });
        const pair = pairMap.get(key)!;
        pair.sharedGroupCount++;
        const msgA = a.message_count_30d ?? 0;
        const msgB = b.message_count_30d ?? 0;
        if (msgA > 0 || msgB > 0) pair.msgPairs.push({ a: msgA, b: msgB });
        const lastA = a.last_message_at ? Math.floor((Date.now() - new Date(a.last_message_at).getTime()) / 86400000) : Infinity;
        const lastB = b.last_message_at ? Math.floor((Date.now() - new Date(b.last_message_at).getTime()) / 86400000) : Infinity;
        pair.mostRecentDaysAgo = Math.min(pair.mostRecentDaysAgo, lastA, lastB);
      }
    }
  }

  for (const [, contactIds] of dealContactMap) {
    const arr = [...contactIds].filter((id) => contactIdSet.has(id));
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = pairKey(arr[i], arr[j]);
        if (!pairMap.has(key)) pairMap.set(key, { sharedGroupCount: 0, sharedDealCount: 0, msgPairs: [], mostRecentDaysAgo: Infinity, hasExplicit: false });
        pairMap.get(key)!.sharedDealCount++;
      }
    }
  }

  for (const r of rels) {
    const key = pairKey(r.contact_a_id, r.contact_b_id);
    if (!pairMap.has(key)) {
      pairMap.set(key, { sharedGroupCount: 0, sharedDealCount: 0, msgPairs: [], mostRecentDaysAgo: Infinity, hasExplicit: true, explicitType: r.relationship_type });
    } else {
      const pair = pairMap.get(key)!;
      pair.hasExplicit = true;
      pair.explicitType = r.relationship_type;
    }
  }

  const edges: GraphEdge[] = [];
  const connectionCounts = new Map<string, number>();

  for (const [key, data] of pairMap) {
    const coEngagementRatio = data.msgPairs.length > 0
      ? data.msgPairs.reduce((sum, p) => { const max = Math.max(p.a, p.b); return sum + (max > 0 ? Math.min(p.a, p.b) / max : 0); }, 0) / data.msgPairs.length
      : 0;
    const pairData: ContactPairData = {
      sharedGroupCount: data.sharedGroupCount,
      sharedDealCount: data.sharedDealCount,
      coEngagementRatio,
      mostRecentActivityDaysAgo: data.mostRecentDaysAgo === Infinity ? 999 : data.mostRecentDaysAgo,
      hasExplicitRelationship: data.hasExplicit,
    };
    const strength = computeRelationshipStrength(pairData);
    if (strength < 5) continue;
    const [aId, bId] = key.split(":");
    edges.push({ source: aId, target: bId, type: "contact_contact", strength, label: data.explicitType });
    connectionCounts.set(aId, (connectionCounts.get(aId) ?? 0) + 1);
    connectionCounts.set(bId, (connectionCounts.get(bId) ?? 0) + 1);
  }

  for (const m of members) {
    if (contactIdSet.has(m.crm_contact_id)) {
      edges.push({ source: m.crm_contact_id, target: m.group_id, type: "contact_group" });
    }
  }

  const nodes: GraphNode[] = [];
  for (const c of contactList) {
    nodes.push({ id: c.id, type: "contact", label: c.name, meta: { company: c.company, telegram: c.telegram_username, connection_count: connectionCounts.get(c.id) ?? 0, engagement_score: c.engagement_score } });
  }
  for (const g of (groups ?? [])) {
    nodes.push({ id: g.id, type: "group", label: g.group_name, meta: { group_type: g.group_type, member_count: g.member_count } });
  }

  let path: string[] | undefined;
  if (pathFrom && pathTo) path = bfsPath(nodes, edges, pathFrom, pathTo);

  return NextResponse.json({ nodes, edges, path, source: "supabase" });
}

function bfsPath(nodes: GraphNode[], edges: GraphEdge[], from: string, to: string): string[] | undefined {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source); }
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const queue = [from];
  visited.add(from);
  parent.set(from, null);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) {
      const result: string[] = [];
      let node: string | null | undefined = to;
      while (node != null) { result.unshift(node); node = parent.get(node); }
      return result;
    }
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) { visited.add(neighbor); parent.set(neighbor, current); queue.push(neighbor); }
    }
  }
  return undefined;
}
