import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

type GraphNode = {
  id: string;
  type: "deal" | "contact" | "group" | "doc";
  label: string;
  meta: Record<string, unknown>;
};

type GraphEdge = {
  source: string;
  target: string;
  type: string;
};

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const types = searchParams.get("types")?.split(",") ?? ["deal", "contact", "group", "doc"];
  const board = searchParams.get("board");

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  // Fetch deals
  if (types.includes("deal")) {
    let query = supabase
      .from("crm_deals")
      .select("id, deal_name, board_type, stage_id, value, contact_id, tg_group_id, stage:pipeline_stages(name, color)");

    if (board && board !== "All") {
      query = query.eq("board_type", board);
    }

    const { data: deals } = await query;
    for (const d of deals ?? []) {
      nodes.push({
        id: d.id,
        type: "deal",
        label: d.deal_name,
        meta: { board_type: d.board_type, value: d.value, stage: d.stage },
      });
      nodeIds.add(d.id);

      // deal → contact edge
      if (d.contact_id) {
        edges.push({ source: d.id, target: d.contact_id, type: "deal_contact" });
      }
      // deal → group edge
      if (d.tg_group_id) {
        edges.push({ source: d.id, target: d.tg_group_id, type: "deal_group" });
      }
    }
  }

  // Fetch contacts
  if (types.includes("contact")) {
    const { data: contacts } = await supabase
      .from("crm_contacts")
      .select("id, name, company, telegram_username");

    for (const c of contacts ?? []) {
      nodes.push({
        id: c.id,
        type: "contact",
        label: c.name,
        meta: { company: c.company, telegram: c.telegram_username },
      });
      nodeIds.add(c.id);
    }
  }

  // Fetch groups
  if (types.includes("group")) {
    const { data: groups } = await supabase
      .from("tg_groups")
      .select("id, group_name, group_type, member_count");

    for (const g of groups ?? []) {
      nodes.push({
        id: g.id,
        type: "group",
        label: g.group_name,
        meta: { group_type: g.group_type, member_count: g.member_count },
      });
      nodeIds.add(g.id);
    }
  }

  // Fetch docs
  if (types.includes("doc")) {
    const { data: docs } = await supabase
      .from("crm_docs")
      .select("id, title, updated_at");

    for (const d of docs ?? []) {
      nodes.push({
        id: d.id,
        type: "doc",
        label: d.title,
        meta: { updated_at: d.updated_at },
      });
      nodeIds.add(d.id);
    }

    // Doc links as edges
    const { data: docLinks } = await supabase
      .from("crm_doc_links")
      .select("doc_id, entity_type, entity_id");

    for (const link of docLinks ?? []) {
      if (nodeIds.has(link.doc_id) && nodeIds.has(link.entity_id)) {
        edges.push({ source: link.doc_id, target: link.entity_id, type: `doc_${link.entity_type}` });
      }
    }
  }

  // Filter edges to only include nodes that exist
  const validEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  return NextResponse.json({ nodes, edges: validEdges, source: "supabase" });
}
