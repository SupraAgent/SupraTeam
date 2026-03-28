/**
 * GET /api/ai-agent/conversations — List AI conversation history with filters.
 *
 * Visibility rules:
 *   - DM conversations (is_private_dm=true) only visible to admins
 *   - Group conversations visible to all authenticated users
 *   - Filter by chat_id or escalated status
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase, user } = auth;

  const { searchParams } = new URL(request.url);
  const escalatedOnly = searchParams.get("escalated") === "1";
  const chatId = searchParams.get("chat_id");

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("crm_role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.crm_role === "admin_lead";

  let query = supabase
    .from("crm_ai_conversations")
    .select("*, deal:crm_deals(id, deal_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  // Non-admins cannot see DM conversations
  if (!isAdmin) {
    query = query.eq("is_private_dm", false);
  }

  if (escalatedOnly) {
    query = query.eq("escalated", true);
  }
  if (chatId) {
    query = query.eq("tg_chat_id", Number(chatId));
  }

  const { data: conversations } = await query;

  // Stats — scoped to same visibility rules
  let statsQuery = supabase
    .from("crm_ai_conversations")
    .select("id, escalated, qualification_data, is_private_dm");

  if (!isAdmin) {
    statsQuery = statsQuery.eq("is_private_dm", false);
  }

  const { data: stats } = await statsQuery;

  const total = stats?.length ?? 0;
  const escalated = stats?.filter((s: { escalated: boolean }) => s.escalated).length ?? 0;
  const qualified = stats?.filter((s: { qualification_data: unknown }) => s.qualification_data).length ?? 0;

  return NextResponse.json({
    conversations: conversations ?? [],
    stats: { total, escalated, qualified },
  });
}
