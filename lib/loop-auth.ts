import { NextResponse } from "next/server";
import type { createSupabaseAdmin } from "@/lib/supabase";

/**
 * Verify that a user owns a workflow or is an admin_lead.
 * Returns null if authorized, or a NextResponse error if not.
 */
export async function verifyLoopOwnership(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  workflowId: string,
  userId: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("crm_role")
    .eq("id", userId)
    .single();
  if (profile?.crm_role === "admin_lead") return null;

  const { data } = await supabase
    .from("crm_workflows")
    .select("id")
    .eq("id", workflowId)
    .eq("created_by", userId)
    .single();
  if (!data) {
    return NextResponse.json({ error: "Workflow not found or access denied" }, { status: 404 });
  }
  return null;
}
