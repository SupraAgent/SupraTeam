import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: logs } = await supabase
    .from("crm_automation_log")
    .select("*, rule:crm_automation_rules(name), deal:crm_deals(deal_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ logs: logs ?? [] });
}
