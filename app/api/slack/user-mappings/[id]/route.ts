import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** PUT — update a TG↔Slack user mapping */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.telegram_username !== undefined) updates.telegram_username = body.telegram_username;
  if (body.telegram_user_id !== undefined) updates.telegram_user_id = body.telegram_user_id;
  if (body.slack_user_id !== undefined) updates.slack_user_id = body.slack_user_id;
  if (body.slack_display_name !== undefined) updates.slack_display_name = body.slack_display_name;

  const { data, error } = await auth.admin
    .from("crm_tg_slack_user_map")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/** DELETE — remove a TG↔Slack user mapping */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { error } = await auth.admin
    .from("crm_tg_slack_user_map")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
