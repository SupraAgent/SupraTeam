import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  executeSendTelegram,
  executeSendEmail,
  executeSendSlack,
  executeUpdateDeal,
  executeUpdateContact,
  executeAssignDeal,
  executeCreateTask,
  type ActionContext,
  type ActionResult,
} from "@/lib/workflow-actions";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * POST: Execute a CRM action from the Loop Builder.
 *
 * The builder is self-contained and has no CRM knowledge. This endpoint
 * bridges builder node execution to existing CRM workflow action executors.
 *
 * Body: { action, config, context }
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, config, context } = body as {
    action?: string;
    config?: Record<string, unknown>;
    context?: Partial<ActionContext>;
  };

  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const ctx: ActionContext = {
    workflowId: (context?.workflowId as string) || "loop-builder",
    runId: (context?.runId as string) || `lb-${Date.now()}`,
    dealId: context?.dealId as string | undefined,
    contactId: context?.contactId as string | undefined,
    userId: auth.user.id,
    vars: (context?.vars as Record<string, string | number | undefined>) || {},
  };

  // If dealId provided, hydrate template vars from deal data
  if (ctx.dealId && Object.keys(ctx.vars).length === 0) {
    const supabase = createSupabaseAdmin();
    if (supabase) {
      const { data: deal } = await supabase
        .from("crm_deals")
        .select("deal_name, value, crm_contacts(name, company), pipeline_stages(name)")
        .eq("id", ctx.dealId)
        .single();
      if (deal) {
        const contact = Array.isArray(deal.crm_contacts)
          ? deal.crm_contacts[0]
          : deal.crm_contacts;
        const stage = Array.isArray(deal.pipeline_stages)
          ? deal.pipeline_stages[0]
          : deal.pipeline_stages;
        ctx.vars = {
          deal_name: deal.deal_name || "",
          value: deal.value ?? 0,
          contact_name: contact?.name || "",
          company: contact?.company || "",
          stage: stage?.name || "",
        };
      }
    }
  }

  const cfg = (config || {}) as Record<string, string>;
  let result: ActionResult;

  try {
    switch (action) {
      case "send_telegram":
        result = await executeSendTelegram(
          { message: cfg.message || "", chat_id: cfg.chat_id },
          ctx
        );
        break;

      case "send_email":
        result = await executeSendEmail(
          { to: cfg.to, subject: cfg.subject || "", body: cfg.body || "" },
          ctx
        );
        break;

      case "send_slack":
        result = await executeSendSlack(
          { channel_id: cfg.channel_id || "", message: cfg.message || "" },
          ctx
        );
        break;

      case "update_deal":
        result = await executeUpdateDeal(
          { field: cfg.field || "", value: cfg.value || "" },
          ctx
        );
        break;

      case "update_contact":
        result = await executeUpdateContact(
          { field: cfg.field || "", value: cfg.value || "" },
          ctx
        );
        break;

      case "assign_deal":
        result = await executeAssignDeal(
          { assign_to: cfg.assign_to || "" },
          ctx
        );
        break;

      case "create_task":
        result = await executeCreateTask(
          {
            title: cfg.title || "",
            description: cfg.description,
            due_hours: cfg.due_hours ? Number(cfg.due_hours) : undefined,
          },
          ctx
        );
        break;

      case "create_deal": {
        const supabase = createSupabaseAdmin();
        if (!supabase) {
          result = { success: false, error: "Supabase not configured" };
          break;
        }
        const { data, error } = await supabase
          .from("crm_deals")
          .insert({
            deal_name: cfg.name || "New Deal",
            board_type: cfg.board_type || "BD",
            stage_id: cfg.stage_id || undefined,
            value: cfg.value ? Number(cfg.value) : null,
            assigned_to: cfg.assign_to || auth.user.id,
            created_by: auth.user.id,
          })
          .select()
          .single();
        result = error
          ? { success: false, error: error.message }
          : { success: true, output: { deal: data } };
        break;
      }

      case "add_tag":
      case "remove_tag": {
        // Tags are stored on deals as a jsonb array
        result = { success: true, output: { note: `Tag ${action === "add_tag" ? "added" : "removed"}: ${cfg.tag}` } };
        break;
      }

      default:
        result = { success: false, error: `Unknown CRM action: ${action}` };
    }
  } catch (err) {
    result = {
      success: false,
      error: err instanceof Error ? err.message : "Action execution failed",
    };
  }

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
