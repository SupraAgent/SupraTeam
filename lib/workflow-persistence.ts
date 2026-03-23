/**
 * Supabase persistence adapter for the automation builder engine.
 * Implements PersistenceAdapter from @supra/automation-builder.
 */
import type { PersistenceAdapter, WorkflowEvent } from "@supra/automation-builder";
import { createSupabaseAdmin } from "@/lib/supabase";

export function createSupabasePersistence(): PersistenceAdapter {
  return {
    async createRun(workflowId: string, event: WorkflowEvent): Promise<string> {
      const supabase = createSupabaseAdmin();
      if (!supabase) throw new Error("Supabase not configured");

      const { data: run } = await supabase
        .from("crm_workflow_runs")
        .insert({
          workflow_id: workflowId,
          trigger_event: event,
          status: "running",
        })
        .select("id")
        .single();

      return run?.id ?? "";
    },

    async updateRun(
      runId: string,
      status: string,
      nodeOutputs: Record<string, unknown>,
      error?: string,
      currentNodeId?: string
    ): Promise<void> {
      if (!runId) return;
      const supabase = createSupabaseAdmin();
      if (!supabase) return;

      const update: Record<string, unknown> = {
        status,
        node_outputs: nodeOutputs,
        error: error ?? null,
      };

      if (currentNodeId) {
        update.current_node_id = currentNodeId;
      }

      if (status === "completed" || status === "failed") {
        update.completed_at = new Date().toISOString();
      }

      await supabase
        .from("crm_workflow_runs")
        .update(update)
        .eq("id", runId);
    },

    async scheduleResume(
      runId: string,
      workflowId: string,
      resumeAt: string,
      event: WorkflowEvent
    ): Promise<void> {
      const supabase = createSupabaseAdmin();
      if (!supabase) return;

      const dealId = (event as unknown as Record<string, unknown>).dealId as string | undefined;

      await supabase.from("crm_scheduled_messages").insert({
        deal_id: dealId || null,
        tg_chat_id: 0, // sentinel — not a real TG message
        message_text: JSON.stringify({
          _workflow_resume: true,
          run_id: runId,
          workflow_id: workflowId,
        }),
        send_at: resumeAt,
        status: "pending",
      });
    },

    async onWorkflowComplete(workflowId: string): Promise<void> {
      const supabase = createSupabaseAdmin();
      if (!supabase) return;

      // Increment run count and update last_run_at
      const { data: wf } = await supabase
        .from("crm_workflows")
        .select("run_count")
        .eq("id", workflowId)
        .single();

      await supabase
        .from("crm_workflows")
        .update({
          last_run_at: new Date().toISOString(),
          run_count: (wf?.run_count ?? 0) + 1,
        })
        .eq("id", workflowId);
    },
  };
}
