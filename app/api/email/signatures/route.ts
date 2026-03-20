import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET: Get signature for a connection */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connection_id");

  let query = auth.admin
    .from("crm_email_connections")
    .select("id, email, writing_style_json")
    .eq("user_id", auth.user.id);

  if (connectionId) {
    query = query.eq("id", connectionId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  // Extract signatures from writing_style_json
  const signatures = (data ?? []).map((conn) => ({
    connection_id: conn.id,
    email: conn.email,
    signature_html: (conn.writing_style_json as Record<string, unknown>)?.signature_html ?? "",
    signature_text: (conn.writing_style_json as Record<string, unknown>)?.signature_text ?? "",
  }));

  return NextResponse.json({ data: signatures, source: "supabase" });
}

/** POST: Update signature for a connection */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { connection_id: string; signature_html: string; signature_text: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.connection_id) {
    return NextResponse.json({ error: "connection_id required" }, { status: 400 });
  }

  // Get current writing_style_json
  const { data: conn } = await auth.admin
    .from("crm_email_connections")
    .select("writing_style_json")
    .eq("id", body.connection_id)
    .eq("user_id", auth.user.id)
    .single();

  const existing = (conn?.writing_style_json as Record<string, unknown>) ?? {};

  const { error } = await auth.admin
    .from("crm_email_connections")
    .update({
      writing_style_json: {
        ...existing,
        signature_html: body.signature_html,
        signature_text: body.signature_text,
      },
    })
    .eq("id", body.connection_id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save signature" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
