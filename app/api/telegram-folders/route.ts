import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("tg_folder_sync")
    .select("*")
    .order("slug");

  if (error) {
    console.error("[api/telegram-folders] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch folder syncs" }, { status: 500 });
  }

  return NextResponse.json({ syncs: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const userId = user.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { slug, tg_filter_id, folder_name } = body as { slug?: string; tg_filter_id?: number; folder_name?: string };
  if (!slug || !tg_filter_id || !folder_name) {
    return NextResponse.json(
      { error: "slug, tg_filter_id, and folder_name are required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tg_folder_sync")
    .upsert(
      {
        user_id: userId,
        slug,
        tg_filter_id,
        folder_name,
        last_synced_at: now,
        sync_status: "active",
        error_message: null,
        updated_at: now,
      },
      { onConflict: "user_id,slug" }
    )
    .select()
    .single();

  if (error) {
    console.error("[api/telegram-folders] POST error:", error);
    return NextResponse.json({ error: "Failed to save folder sync" }, { status: 500 });
  }

  return NextResponse.json({ sync: data, ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const userId = user.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { slug } = body as { slug?: string };
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tg_folder_sync")
    .delete()
    .eq("user_id", userId)
    .eq("slug", slug);

  if (error) {
    console.error("[api/telegram-folders] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete folder sync" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
