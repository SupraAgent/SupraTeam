import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: doc, error } = await supabase
    .from("crm_docs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("[api/docs/[id]] error:", error);
    return NextResponse.json({ error: "Doc not found" }, { status: 404 });
  }

  // Get links
  const { data: links } = await supabase
    .from("crm_doc_links")
    .select("id, entity_type, entity_id")
    .eq("doc_id", id);

  // Resolve entity names for display
  const enrichedLinks = await resolveEntityNames(supabase, links ?? []);

  return NextResponse.json({ doc: { ...doc, links: enrichedLinks } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };

  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;

  const { data: doc, error } = await supabase
    .from("crm_docs")
    .update(updates)
    .eq("id", id)
    .eq("created_by", user.id)
    .select()
    .single();

  if (error) {
    console.error("[api/docs/[id]] update error:", error);
    return NextResponse.json({ error: "Doc not found or not owned by you" }, { status: 404 });
  }

  // If links provided, replace them
  if (body.links !== undefined && Array.isArray(body.links)) {
    await supabase.from("crm_doc_links").delete().eq("doc_id", id);

    const linkRows = body.links
      .filter((l: { entity_type?: string; entity_id?: string }) => l.entity_type && l.entity_id)
      .map((l: { entity_type: string; entity_id: string }) => ({
        doc_id: id,
        entity_type: l.entity_type,
        entity_id: l.entity_id,
      }));

    if (linkRows.length > 0) {
      await supabase.from("crm_doc_links").insert(linkRows);
    }
  }

  return NextResponse.json({ doc, ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { data, error } = await supabase
    .from("crm_docs")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id)
    .select("id")
    .single();

  if (error || !data) {
    console.error("[api/docs/[id]] delete error:", error);
    return NextResponse.json({ error: "Doc not found or not owned by you" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// Resolve entity names for link display
async function resolveEntityNames(
  supabase: ReturnType<typeof import("@/lib/supabase").createSupabaseAdmin> & {},
  links: { id: string; entity_type: string; entity_id: string }[]
) {
  if (links.length === 0) return [];

  const dealIds = links.filter((l) => l.entity_type === "deal").map((l) => l.entity_id);
  const contactIds = links.filter((l) => l.entity_type === "contact").map((l) => l.entity_id);
  const groupIds = links.filter((l) => l.entity_type === "group").map((l) => l.entity_id);

  const nameMap: Record<string, string> = {};

  if (dealIds.length > 0) {
    const { data } = await supabase.from("crm_deals").select("id, deal_name").in("id", dealIds);
    data?.forEach((d) => { nameMap[d.id] = d.deal_name; });
  }
  if (contactIds.length > 0) {
    const { data } = await supabase.from("crm_contacts").select("id, name").in("id", contactIds);
    data?.forEach((c) => { nameMap[c.id] = c.name; });
  }
  if (groupIds.length > 0) {
    const { data } = await supabase.from("tg_groups").select("id, group_name").in("id", groupIds);
    data?.forEach((g) => { nameMap[g.id] = g.group_name; });
  }

  return links.map((l) => ({
    ...l,
    entity_name: nameMap[l.entity_id] ?? "Unknown",
  }));
}
