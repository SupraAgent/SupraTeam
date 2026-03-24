import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdmin()!;

  // Fetch all profiles (team members)
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, display_name, avatar_url, github_username, telegram_id, crm_role, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/team] error:", error);
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }

  // Get user emails from auth (admin only)
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers();
  const emailMap: Record<string, string> = {};
  for (const u of authUsers ?? []) {
    emailMap[u.id] = u.email ?? "";
  }

  const enriched = (profiles ?? []).map((p) => ({
    ...p,
    email: emailMap[p.id] ?? null,
  }));

  return NextResponse.json({ data: enriched, source: "supabase" });
}

export async function PUT(request: Request) {
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { user_id, crm_role } = body;

  if (typeof user_id !== "string") {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const validRoles = ["bd_lead", "marketing_lead", "admin_lead", null];
  if (!validRoles.includes(crm_role as string | null)) {
    return NextResponse.json({ error: "Invalid role. Must be bd_lead, marketing_lead, admin_lead, or null" }, { status: 400 });
  }

  // RBAC: only admin_lead can change roles
  const admin = createSupabaseAdmin()!;
  const { data: callerProfile } = await admin.from("profiles").select("crm_role").eq("id", user.id).single();
  if (callerProfile?.crm_role !== "admin_lead") {
    return NextResponse.json({ error: "Only admin leads can change team roles" }, { status: 403 });
  }

  // Get old role for audit log
  const { data: targetProfile } = await admin.from("profiles").select("crm_role").eq("id", user_id).single();
  const oldRole = targetProfile?.crm_role ?? null;

  const { data: profile, error } = await admin
    .from("profiles")
    .update({ crm_role: crm_role ?? null })
    .eq("id", user_id)
    .select()
    .single();

  if (error) {
    console.error("[api/team] role update error:", error);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }

  // Audit log
  await admin.from("crm_audit_log").insert({
    actor_id: user.id,
    action: "role_change",
    target_id: user_id,
    details: { old_role: oldRole, new_role: crm_role ?? null },
  });

  return NextResponse.json({ data: profile, source: "supabase" });
}

export async function DELETE(request: Request) {
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { user_id } = body;
  if (typeof user_id !== "string") {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  if (user_id === user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  const admin = createSupabaseAdmin()!;

  // RBAC: only admin_lead can remove members
  const { data: callerProfile } = await admin.from("profiles").select("crm_role").eq("id", user.id).single();
  if (callerProfile?.crm_role !== "admin_lead") {
    return NextResponse.json({ error: "Only admin leads can remove team members" }, { status: 403 });
  }

  // Get target info for audit log
  const { data: targetProfile } = await admin.from("profiles").select("display_name, crm_role").eq("id", user_id).single();

  // Remove CRM role (user stays in auth but loses CRM access)
  const { error } = await admin
    .from("profiles")
    .update({ crm_role: null })
    .eq("id", user_id);

  if (error) {
    console.error("[api/team] remove member error:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }

  // Audit log
  await admin.from("crm_audit_log").insert({
    actor_id: user.id,
    action: "member_remove",
    target_id: user_id,
    details: { display_name: targetProfile?.display_name, old_role: targetProfile?.crm_role },
  });

  return NextResponse.json({ data: { removed: user_id }, source: "supabase" });
}
