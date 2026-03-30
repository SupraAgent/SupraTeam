import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const DEFAULT_TAGS = [
  { name: "BD", color: "#3b82f6", icon: "briefcase" },
  { name: "Legal", color: "#ef4444", icon: "scale" },
  { name: "Marketing", color: "#a855f7", icon: "megaphone" },
  { name: "Admin", color: "#6b7280", icon: "shield" },
  { name: "Finance", color: "#22c55e", icon: "dollar" },
  { name: "Partnership", color: "#f59e0b", icon: "handshake" },
  { name: "Technical", color: "#06b6d4", icon: "code" },
  { name: "Urgent", color: "#dc2626", icon: "alert" },
];

/** GET /api/email/tags — List user's email tags */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data: tags } = await supabase
    .from("crm_email_tags")
    .select("id, name, color, icon, is_system, created_at")
    .eq("user_id", user.id)
    .order("name");

  // Seed default tags if none exist (upsert to avoid race condition)
  if (!tags || tags.length === 0) {
    const inserts = DEFAULT_TAGS.map((t) => ({
      user_id: user.id,
      name: t.name,
      color: t.color,
      icon: t.icon,
      is_system: true,
    }));

    const { data: seeded } = await supabase
      .from("crm_email_tags")
      .upsert(inserts, { onConflict: "user_id,name", ignoreDuplicates: true })
      .select("id, name, color, icon, is_system, created_at");

    return NextResponse.json({ data: seeded ?? [] });
  }

  return NextResponse.json({ data: tags });
}

/** POST /api/email/tags — Create a custom tag */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { name?: string; color?: string; icon?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_email_tags")
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      color: body.color || "#6b7280",
      icon: body.icon || null,
    })
    .select("id, name, color, icon, is_system, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Tag already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

/** DELETE /api/email/tags?id=uuid — Delete a tag */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await supabase
    .from("crm_email_tags")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
