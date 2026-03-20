import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET: Fetch version history for a template */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const url = new URL(request.url);
  const templateKey = url.searchParams.get("key");
  if (!templateKey) {
    return NextResponse.json({ error: "key parameter required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("crm_template_versions")
    .select("*")
    .eq("template_key", templateKey)
    .order("version_number", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: data ?? [] });
}
