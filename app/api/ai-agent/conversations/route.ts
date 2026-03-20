/**
 * GET /api/ai-agent/conversations — List AI conversation history with filters
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const escalatedOnly = searchParams.get("escalated") === "1";
  const chatId = searchParams.get("chat_id");

  let query = supabase
    .from("crm_ai_conversations")
    .select("*, deal:crm_deals(id, deal_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (escalatedOnly) {
    query = query.eq("escalated", true);
  }
  if (chatId) {
    query = query.eq("tg_chat_id", Number(chatId));
  }

  const { data: conversations } = await query;

  // Stats
  const { data: stats } = await supabase
    .from("crm_ai_conversations")
    .select("id, escalated, qualification_data");

  const total = stats?.length ?? 0;
  const escalated = stats?.filter((s) => s.escalated).length ?? 0;
  const qualified = stats?.filter((s) => s.qualification_data).length ?? 0;

  return NextResponse.json({
    conversations: conversations ?? [],
    stats: { total, escalated, qualified },
  });
}
