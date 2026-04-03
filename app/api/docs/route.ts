import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");

  // If filtering by entity, get doc IDs from links first
  if (entityType && entityId) {
    const { data: links, error: linkErr } = await supabase
      .from("crm_doc_links")
      .select("doc_id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);

    if (linkErr) {
      console.error("[api/docs] link query error:", linkErr);
      return NextResponse.json({ error: "Failed to fetch docs" }, { status: 500 });
    }

    const docIds = (links ?? []).map((l) => l.doc_id);
    if (docIds.length === 0) {
      return NextResponse.json({ docs: [], source: "supabase" });
    }

    const { data: docs, error } = await supabase
      .from("crm_docs")
      .select("*")
      .in("id", docIds)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[api/docs] error:", error);
      return NextResponse.json({ error: "Failed to fetch docs" }, { status: 500 });
    }

    return NextResponse.json({ docs: docs ?? [], source: "supabase" });
  }

  // List all docs
  const { data: docs, error } = await supabase
    .from("crm_docs")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[api/docs] error:", error);
    return NextResponse.json({ error: "Failed to fetch docs" }, { status: 500 });
  }

  // Fetch links for all docs
  const docIds = (docs ?? []).map((d) => d.id);
  let linksMap: Record<string, { entity_type: string; entity_id: string }[]> = {};

  if (docIds.length > 0) {
    const { data: links } = await supabase
      .from("crm_doc_links")
      .select("doc_id, entity_type, entity_id")
      .in("doc_id", docIds);

    if (links) {
      for (const link of links) {
        if (!linksMap[link.doc_id]) linksMap[link.doc_id] = [];
        linksMap[link.doc_id].push({ entity_type: link.entity_type, entity_id: link.entity_id });
      }
    }
  }

  const enriched = (docs ?? []).map((d) => ({
    ...d,
    links: linksMap[d.id] ?? [],
  }));

  return NextResponse.json({ docs: enriched, source: "supabase" });
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
  const { title, content, links } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const { data: doc, error } = await supabase
    .from("crm_docs")
    .insert({
      title,
      content: content ?? "",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/docs] insert error:", error);
    return NextResponse.json({ error: "Failed to create doc" }, { status: 500 });
  }

  // Insert links
  if (links && Array.isArray(links) && links.length > 0 && doc) {
    const linkRows = links
      .filter((l: { entity_type?: string; entity_id?: string }) => l.entity_type && l.entity_id)
      .map((l: { entity_type: string; entity_id: string }) => ({
        doc_id: doc.id,
        entity_type: l.entity_type,
        entity_id: l.entity_id,
      }));

    if (linkRows.length > 0) {
      await supabase.from("crm_doc_links").insert(linkRows);
    }
  }

  return NextResponse.json({ doc, ok: true });
}
