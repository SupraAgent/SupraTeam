import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;
  const { id } = await params;

  const { data: logs, error } = await supabase
    .from("crm_enrichment_log")
    .select("id, field_name, old_value, new_value, source, created_by, created_at")
    .eq("contact_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[enrichment-log] Query error:", error);
    return NextResponse.json({ error: "Failed to fetch enrichment log" }, { status: 500 });
  }

  return NextResponse.json({ logs: logs ?? [] });
}
