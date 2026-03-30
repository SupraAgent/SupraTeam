import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { createSupabaseAdmin } from "@/lib/supabase";
import { verifyLoopOwnership } from "@/lib/loop-auth";

type RouteCtx = { params: Promise<{ id: string }> };

/** List revisions for a workflow, ordered by version DESC */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const ownerErr = await verifyLoopOwnership(supabase, id, auth.user.id);
  if (ownerErr) return ownerErr;

  const { data, error } = await supabase
    .from("crm_workflow_revisions")
    .select("id, version, created_at, note, saved_by, nodes, edges")
    .eq("workflow_id", id)
    .order("version", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ revisions: data ?? [] });
}

/** Restore a revision — copy its nodes/edges back to the workflow */
export async function POST(request: NextRequest, ctx: RouteCtx) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const revisionId = body.revision_id;
  if (!revisionId || typeof revisionId !== "string") {
    return NextResponse.json({ error: "revision_id is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const ownerErr = await verifyLoopOwnership(supabase, id, auth.user.id);
  if (ownerErr) return ownerErr;

  // Fetch the revision
  const { data: revision, error: revErr } = await supabase
    .from("crm_workflow_revisions")
    .select("nodes, edges, version")
    .eq("id", revisionId)
    .eq("workflow_id", id)
    .single();

  if (revErr || !revision) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }

  // Snapshot current state before restoring
  const { data: current } = await supabase
    .from("crm_workflows")
    .select("nodes, edges, version")
    .eq("id", id)
    .single();

  if (current?.nodes && current?.edges) {
    await supabase.from("crm_workflow_revisions").insert({
      workflow_id: id,
      version: current.version ?? 1,
      nodes: current.nodes,
      edges: current.edges,
      saved_by: auth.user.id,
      note: `Auto-snapshot before restoring to v${revision.version}`,
    });

    // Prune old revisions — keep only the most recent 50
    const { data: allRevisions } = await supabase
      .from("crm_workflow_revisions")
      .select("id")
      .eq("workflow_id", id)
      .order("version", { ascending: false });

    if (allRevisions && allRevisions.length > 50) {
      const idsToDelete = allRevisions.slice(50).map((r) => r.id);
      await supabase
        .from("crm_workflow_revisions")
        .delete()
        .in("id", idsToDelete);
    }
  }

  // Restore the revision's nodes/edges to the workflow
  const { error: updateErr } = await supabase
    .from("crm_workflows")
    .update({
      nodes: revision.nodes,
      edges: revision.edges,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Bump version
  const { error: rpcError } = await supabase.rpc("increment_workflow_version", { wf_id: id });
  if (rpcError && current) {
    await supabase.from("crm_workflows").update({ version: (current.version ?? 0) + 1 }).eq("id", id);
  }

  return NextResponse.json({ ok: true, restored_version: revision.version });
}
