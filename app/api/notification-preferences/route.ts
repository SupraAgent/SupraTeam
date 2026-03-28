import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { data } = await supabase
    .from("crm_notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // Return defaults if no preferences set
  return NextResponse.json({
    preferences: data ?? {
      muted_types: [],
      quiet_hours_enabled: false,
      quiet_hours_start: null,
      quiet_hours_end: null,
      quiet_hours_tz: "UTC",
      digest_frequency: "realtime",
      digest_day: null,
      digest_hour: 9,
    },
  });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();
  const {
    muted_types, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_tz,
    digest_frequency, digest_day, digest_hour,
    push_enabled, push_stage_changes, push_tg_messages, push_escalations, push_outreach_replies,
  } = body;

  const { data, error } = await supabase
    .from("crm_notification_preferences")
    .upsert({
      user_id: user.id,
      muted_types: muted_types ?? [],
      quiet_hours_enabled: quiet_hours_enabled ?? false,
      quiet_hours_start: quiet_hours_start ?? null,
      quiet_hours_end: quiet_hours_end ?? null,
      quiet_hours_tz: quiet_hours_tz ?? "UTC",
      digest_frequency: digest_frequency ?? "realtime",
      digest_day: digest_day ?? null,
      digest_hour: digest_hour ?? 9,
      push_enabled: push_enabled ?? true,
      push_stage_changes: push_stage_changes ?? true,
      push_tg_messages: push_tg_messages ?? true,
      push_escalations: push_escalations ?? true,
      push_outreach_replies: push_outreach_replies ?? true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preferences: data, ok: true });
}
