import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET — list all TG↔Slack user mappings */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.admin
    .from("crm_tg_slack_user_map")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

/** POST — create a new TG↔Slack user mapping */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { telegram_user_id, telegram_username, slack_user_id, slack_display_name } = body;

  if (!telegram_username || !slack_user_id) {
    return NextResponse.json(
      { error: "telegram_username and slack_user_id are required" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.admin
    .from("crm_tg_slack_user_map")
    .insert({
      telegram_user_id: telegram_user_id || 0,
      telegram_username,
      slack_user_id,
      slack_display_name: slack_display_name || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This Telegram user is already mapped" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
