import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  // Try user-scoped client first, fall back to admin
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile, error } = await (createSupabaseAdmin()!)
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      ...profile,
      email: user.email,
      telegram_username: user.user_metadata?.telegram_username ?? profile?.telegram_username ?? null,
    },
    source: "supabase",
  });
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

  const { display_name, avatar_url } = body;

  // Only allow updating specific fields
  const updates: Record<string, unknown> = {};
  if (typeof display_name === "string" && display_name.trim()) {
    updates.display_name = display_name.trim();
  }
  if (typeof avatar_url === "string") {
    updates.avatar_url = avatar_url || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const admin = createSupabaseAdmin()!;

  const { data: profile, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    console.error("[api/profile] update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  // Also update user_metadata so sidebar reflects changes immediately
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      ...updates,
    },
  });

  return NextResponse.json({ data: profile, source: "supabase" });
}
