/**
 * GET /api/ai-agent/escalations — Get recent AI escalations (last 7 days)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("crm_ai_conversations")
    .select("id, tg_chat_id, tg_user_id, escalation_reason, handoff_summary, created_at")
    .eq("escalated", true)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ escalations: data ?? [] });
}
