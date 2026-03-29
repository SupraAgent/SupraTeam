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

const VALID_ACTIONS = new Set([
  "send_telegram",
  "send_email",
  "send_slack",
  "send_broadcast",
  "update_deal",
  "update_contact",
  "assign_deal",
  "create_deal",
  "create_task",
  "add_tag",
  "remove_tag",
  "tg_manage_access",
  "ai_summarize",
  "ai_classify",
  "add_to_sequence",
  "remove_from_sequence",
  "http_request",
]);

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

  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: `Unknown CRM action: ${action}` }, { status: 400 });
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

      case "send_broadcast": {
        const supabase = createSupabaseAdmin();
        if (!supabase) {
          result = { success: false, error: "Supabase not configured" };
          break;
        }
        if (!cfg.message) {
          result = { success: false, error: "message is required for broadcast" };
          break;
        }
        // Broadcast to all groups matching a slug filter, or a specific group list
        const slugFilter = cfg.slug;
        const groupIds = cfg.group_ids ? cfg.group_ids.split(",").map((s) => s.trim()) : [];

        let targetGroupIds: string[] = groupIds;
        if (slugFilter && targetGroupIds.length === 0) {
          const { data: slugGroups } = await supabase
            .from("tg_group_slugs")
            .select("group_id, tg_groups(telegram_group_id)")
            .eq("slug", slugFilter);
          if (slugGroups) {
            targetGroupIds = slugGroups
              .map((sg) => {
                const g = Array.isArray(sg.tg_groups) ? sg.tg_groups[0] : sg.tg_groups;
                return g?.telegram_group_id;
              })
              .filter(Boolean) as string[];
          }
        }

        if (targetGroupIds.length === 0) {
          result = { success: false, error: "No target groups found for broadcast" };
          break;
        }

        let sentCount = 0;
        const errors: string[] = [];
        for (const gid of targetGroupIds) {
          const sendResult = await executeSendTelegram(
            { message: cfg.message, chat_id: gid },
            ctx
          );
          if (sendResult.success) {
            sentCount++;
          } else {
            errors.push(`${gid}: ${sendResult.error}`);
          }
        }
        result = {
          success: sentCount > 0,
          output: { sent: sentCount, total: targetGroupIds.length, errors },
        };
        break;
      }

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

      case "add_tag": {
        const supabase = createSupabaseAdmin();
        if (!supabase) {
          result = { success: false, error: "Supabase not configured" };
          break;
        }
        if (!cfg.tag) {
          result = { success: false, error: "tag is required" };
          break;
        }
        if (!ctx.dealId) {
          result = { success: false, error: "dealId is required in context for add_tag" };
          break;
        }
        const { data: deal } = await supabase
          .from("crm_deals")
          .select("tags")
          .eq("id", ctx.dealId)
          .single();
        const existing: string[] = Array.isArray(deal?.tags) ? deal.tags : [];
        if (!existing.includes(cfg.tag)) {
          existing.push(cfg.tag);
          const { error } = await supabase
            .from("crm_deals")
            .update({ tags: existing })
            .eq("id", ctx.dealId);
          if (error) {
            result = { success: false, error: error.message };
            break;
          }
        }
        result = { success: true, output: { tags: existing } };
        break;
      }

      case "remove_tag": {
        const supabase = createSupabaseAdmin();
        if (!supabase) {
          result = { success: false, error: "Supabase not configured" };
          break;
        }
        if (!cfg.tag) {
          result = { success: false, error: "tag is required" };
          break;
        }
        if (!ctx.dealId) {
          result = { success: false, error: "dealId is required in context for remove_tag" };
          break;
        }
        const { data: deal } = await supabase
          .from("crm_deals")
          .select("tags")
          .eq("id", ctx.dealId)
          .single();
        const existing: string[] = Array.isArray(deal?.tags) ? deal.tags : [];
        const filtered = existing.filter((t) => t !== cfg.tag);
        const { error } = await supabase
          .from("crm_deals")
          .update({ tags: filtered })
          .eq("id", ctx.dealId);
        if (error) {
          result = { success: false, error: error.message };
          break;
        }
        result = { success: true, output: { tags: filtered } };
        break;
      }

      case "tg_manage_access": {
        const supabase = createSupabaseAdmin();
        if (!supabase) {
          result = { success: false, error: "Supabase not configured" };
          break;
        }
        if (!cfg.telegram_user_id || !cfg.slug) {
          result = { success: false, error: "telegram_user_id and slug are required" };
          break;
        }
        const op = cfg.operation || "add";
        // Find groups with this slug
        const { data: slugGroups } = await supabase
          .from("tg_group_slugs")
          .select("group_id, tg_groups(telegram_group_id)")
          .eq("slug", cfg.slug);

        if (!slugGroups || slugGroups.length === 0) {
          result = { success: false, error: `No groups found with slug: ${cfg.slug}` };
          break;
        }

        // Log the access change
        await supabase.from("crm_slug_access_log").insert({
          slug: cfg.slug,
          telegram_user_id: cfg.telegram_user_id,
          action: op === "remove" ? "removed" : "added",
          performed_by: auth.user.id,
        });

        result = {
          success: true,
          output: {
            operation: op,
            slug: cfg.slug,
            groups_affected: slugGroups.length,
          },
        };
        break;
      }

      case "ai_summarize": {
        if (!ctx.dealId) {
          result = { success: false, error: "dealId is required for ai_summarize" };
          break;
        }
        // Call the AI chat endpoint to generate a summary
        const summaryRes = await fetch(new URL("/api/loop/flow-execute-llm", request.url).toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: request.headers.get("cookie") || "",
          },
          body: JSON.stringify({
            prompt: `Summarize the current state of deal "${ctx.vars.deal_name || ctx.dealId}" for company "${ctx.vars.company || "unknown"}". Stage: ${ctx.vars.stage || "unknown"}. Value: ${ctx.vars.value || "unknown"}.${cfg.extra_context ? ` Additional context: ${cfg.extra_context}` : ""}`,
            maxTokens: 500,
            temperature: 0.3,
          }),
        });
        if (!summaryRes.ok) {
          result = { success: false, error: "AI summarize request failed" };
          break;
        }
        const summaryData = await summaryRes.json();
        result = { success: true, output: { summary: summaryData.content } };
        break;
      }

      case "ai_classify": {
        if (!ctx.dealId && !ctx.contactId) {
          result = { success: false, error: "dealId or contactId is required for ai_classify" };
          break;
        }
        const categories = cfg.categories || "hot,warm,cold";
        const classifyRes = await fetch(new URL("/api/loop/flow-execute-llm", request.url).toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: request.headers.get("cookie") || "",
          },
          body: JSON.stringify({
            prompt: `Classify this deal into one of these categories: ${categories}. Deal: "${ctx.vars.deal_name || "unknown"}", Company: "${ctx.vars.company || "unknown"}", Stage: "${ctx.vars.stage || "unknown"}", Value: ${ctx.vars.value || "unknown"}.${cfg.extra_context ? ` Context: ${cfg.extra_context}` : ""} Respond with ONLY the category name.`,
            maxTokens: 50,
            temperature: 0,
          }),
        });
        if (!classifyRes.ok) {
          result = { success: false, error: "AI classify request failed" };
          break;
        }
        const classifyData = await classifyRes.json();
        result = { success: true, output: { classification: classifyData.content?.trim() } };
        break;
      }

      case "add_to_sequence": {
        const supabase = createSupabaseAdmin();
        if (!supabase) {
          result = { success: false, error: "Supabase not configured" };
          break;
        }
        if (!cfg.sequence_id) {
          result = { success: false, error: "sequence_id is required" };
          break;
        }
        const entityId = ctx.dealId || ctx.contactId;
        if (!entityId) {
          result = { success: false, error: "dealId or contactId is required" };
          break;
        }
        const { error } = await supabase.from("crm_sequence_enrollments").insert({
          sequence_id: cfg.sequence_id,
          entity_id: entityId,
          entity_type: ctx.dealId ? "deal" : "contact",
          enrolled_by: auth.user.id,
          status: "active",
        });
        result = error
          ? { success: false, error: error.message }
          : { success: true, output: { enrolled: entityId, sequence: cfg.sequence_id } };
        break;
      }

      case "remove_from_sequence": {
        const supabase = createSupabaseAdmin();
        if (!supabase) {
          result = { success: false, error: "Supabase not configured" };
          break;
        }
        if (!cfg.sequence_id) {
          result = { success: false, error: "sequence_id is required" };
          break;
        }
        const entityId = ctx.dealId || ctx.contactId;
        if (!entityId) {
          result = { success: false, error: "dealId or contactId is required" };
          break;
        }
        const { error } = await supabase
          .from("crm_sequence_enrollments")
          .update({ status: "removed", removed_at: new Date().toISOString() })
          .eq("sequence_id", cfg.sequence_id)
          .eq("entity_id", entityId)
          .eq("status", "active");
        result = error
          ? { success: false, error: error.message }
          : { success: true, output: { removed: entityId, sequence: cfg.sequence_id } };
        break;
      }

      case "http_request": {
        if (!cfg.url) {
          result = { success: false, error: "url is required for http_request" };
          break;
        }
        // Validate URL — only allow https (and http localhost for dev)
        let parsed: URL;
        try {
          parsed = new URL(cfg.url);
        } catch {
          result = { success: false, error: "Invalid URL" };
          break;
        }
        if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))) {
          result = { success: false, error: "Only HTTPS URLs allowed (except localhost)" };
          break;
        }

        // Block SSRF: reject private/internal IP ranges
        const hostname = parsed.hostname.toLowerCase();
        const ssrfBlocked = [
          /^localhost$/i,
          /^127\./,
          /^10\./,
          /^192\.168\./,
          /^169\.254\./,
          /^172\.(1[6-9]|2\d|3[01])\./,
          /^0\./,
          /^::1$/,
          /^0\.0\.0\.0$/,
          /^fc00:/i,
          /^fe80:/i,
        ];
        if (ssrfBlocked.some((p) => p.test(hostname))) {
          result = { success: false, error: "URLs targeting private/internal networks are not allowed" };
          break;
        }

        const method = (cfg.method || "GET").toUpperCase();
        if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
          result = { success: false, error: `Unsupported HTTP method: ${method}` };
          break;
        }

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (cfg.auth_header) headers["Authorization"] = cfg.auth_header;

        const fetchOpts: RequestInit = { method, headers };
        if (method !== "GET" && cfg.body) {
          fetchOpts.body = cfg.body;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        fetchOpts.signal = controller.signal;

        try {
          const res = await fetch(cfg.url, fetchOpts);
          clearTimeout(timeout);
          const responseText = await res.text();
          result = {
            success: res.ok,
            output: {
              status: res.status,
              body: responseText.slice(0, 5000),
            },
            error: res.ok ? undefined : `HTTP ${res.status}`,
          };
        } catch (fetchErr) {
          clearTimeout(timeout);
          result = {
            success: false,
            error: fetchErr instanceof Error ? fetchErr.message : "HTTP request failed",
          };
        }
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
