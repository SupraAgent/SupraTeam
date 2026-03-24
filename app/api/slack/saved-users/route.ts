import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const { data } = await admin
    .from("crm_slack_users")
    .select("*")
    .order("display_name");

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  let body: { user_id?: string; display_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.user_id?.trim() || !body.display_name?.trim()) {
    return NextResponse.json({ error: "user_id and display_name required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("crm_slack_users")
    .upsert({
      user_id: body.user_id.trim(),
      display_name: body.display_name.trim(),
    }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
