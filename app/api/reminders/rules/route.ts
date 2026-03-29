import { NextResponse } from "next/server";
import { requireAuth, requireLeadRole } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: rules } = await supabase
    .from("crm_stage_reminders")
    .select("*, stage:pipeline_stages(id, name, color, position)")
    .order("created_at");

  return NextResponse.json({ rules: rules ?? [] });
}

export async function PUT(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { rules } = await request.json();
  if (!Array.isArray(rules)) {
    return NextResponse.json({ error: "rules must be an array" }, { status: 400 });
  }

  const results = [];
  for (const rule of rules) {
    if (!rule.stage_id) continue;

    const { data, error } = await supabase
      .from("crm_stage_reminders")
      .upsert({
        stage_id: rule.stage_id,
        remind_after_hours: rule.remind_after_hours ?? 72,
        message: rule.message ?? "Deal needs attention",
        is_active: rule.is_active ?? true,
      }, { onConflict: "stage_id" })
      .select()
      .single();

    if (error) {
      console.error("[reminders/rules] upsert error:", error);
    } else {
      results.push(data);
    }
  }

  return NextResponse.json({ rules: results, ok: true });
}
