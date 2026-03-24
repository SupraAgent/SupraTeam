import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET - List saved Slack channels (from crm_slack_channels table)
 * POST - Add a new saved Slack channel
 * DELETE - Remove a saved channel
 */

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  // Ensure table exists
  await ensureTable(admin);

  const { data, error } = await admin
    .from("crm_slack_channels")
    .select("*")
    .order("channel_name");

  if (error) {
    return NextResponse.json({ data: [] });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  let body: { channel_id?: string; channel_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.channel_id?.trim() || !body.channel_name?.trim()) {
    return NextResponse.json({ error: "channel_id and channel_name required" }, { status: 400 });
  }

  await ensureTable(admin);

  const { data, error } = await admin
    .from("crm_slack_channels")
    .upsert({
      channel_id: body.channel_id.trim(),
      channel_name: body.channel_name.trim(),
    }, { onConflict: "channel_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id");

  if (!channelId) {
    return NextResponse.json({ error: "channel_id required" }, { status: 400 });
  }

  await admin.from("crm_slack_channels").delete().eq("channel_id", channelId);
  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureTable(admin: any) {
  // Try a select — if table doesn't exist, create it
  const { error } = await admin.from("crm_slack_channels").select("id").limit(1);
  if (error?.code === "PGRST204" || error?.code === "42P01" || error?.message?.includes("does not exist")) {
    await admin.rpc("exec_sql_raw", {
      sql: `
        CREATE TABLE IF NOT EXISTS crm_slack_channels (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          channel_id text NOT NULL UNIQUE,
          channel_name text NOT NULL,
          is_private boolean DEFAULT false,
          created_at timestamptz DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS crm_slack_users (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id text NOT NULL UNIQUE,
          display_name text NOT NULL,
          created_at timestamptz DEFAULT now()
        );
      `,
    }).catch(() => {
      // RPC might not exist — table will need manual creation
    });
  }
}
