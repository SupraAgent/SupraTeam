import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * POST: Migrate classic workflows to Loop Builder format.
 *
 * Converts old-style workflow nodes (trigger/action/condition) into
 * Loop Builder CRM node types (crmTriggerNode/crmActionNode/crmConditionNode).
 * Sets builder_type = 'loop' on converted workflows.
 *
 * Query params:
 *   dry_run=true — preview what would be migrated without writing
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // Admin-only: check crm_role
  const { data: profile } = await supabase
    .from("profiles")
    .select("crm_role")
    .eq("id", auth.user.id)
    .single();
  if (profile?.crm_role !== "admin_lead") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "true";

  // Find classic workflows (builder_type is null or 'classic')
  const { data: workflows, error } = await supabase
    .from("crm_workflows")
    .select("id, name, nodes, edges, trigger_type, builder_type")
    .or("builder_type.is.null,builder_type.eq.classic");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    id: string;
    name: string;
    status: "migrated" | "skipped" | "error";
    reason?: string;
    nodeCount?: number;
  }> = [];

  for (const wf of workflows ?? []) {
    const nodes = (wf.nodes ?? []) as Array<Record<string, unknown>>;
    const edges = (wf.edges ?? []) as Array<Record<string, unknown>>;

    if (nodes.length === 0) {
      results.push({ id: wf.id, name: wf.name, status: "skipped", reason: "No nodes" });
      continue;
    }

    // Check if already has CRM node types (already migrated)
    if (nodes.some((n) => typeof n.type === "string" && n.type.startsWith("crm"))) {
      results.push({ id: wf.id, name: wf.name, status: "skipped", reason: "Already Loop Builder format" });
      continue;
    }

    try {
      // Convert node types
      const convertedNodes = nodes.map((node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;

        if (node.type === "trigger") {
          return {
            ...node,
            type: "crmTriggerNode",
            data: {
              label: data.label || "Trigger",
              crmTrigger: data.triggerType || data.trigger_type || wf.trigger_type || "deal_stage_change",
              config: data.config || {},
            },
          };
        }
        if (node.type === "action") {
          return {
            ...node,
            type: "crmActionNode",
            data: {
              label: data.label || "Action",
              crmAction: data.actionType || data.action_type || "send_telegram",
              config: data.config || {},
            },
          };
        }
        if (node.type === "condition") {
          return {
            ...node,
            type: "crmConditionNode",
            data: {
              label: data.label || "Condition",
              field: data.field || "stage",
              operator: data.operator || "equals",
              value: data.value || "",
            },
          };
        }
        // Leave other node types (delay, etc.) as-is
        return node;
      });

      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from("crm_workflows")
          .update({
            nodes: convertedNodes,
            edges,
            builder_type: "loop",
            updated_at: new Date().toISOString(),
          })
          .eq("id", wf.id);

        if (updateErr) {
          results.push({ id: wf.id, name: wf.name, status: "error", reason: updateErr.message });
          continue;
        }
      }

      results.push({
        id: wf.id,
        name: wf.name,
        status: "migrated",
        nodeCount: convertedNodes.length,
      });
    } catch (err) {
      results.push({
        id: wf.id,
        name: wf.name,
        status: "error",
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const migrated = results.filter((r) => r.status === "migrated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    dry_run: dryRun,
    migrated,
    skipped,
    errors,
    results,
  });
}
