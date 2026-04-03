import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** Called after the browser updates TG folder contents. Updates sync timestamp. */
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

  const { slug, error_message } = body as { slug?: string; error_message?: string };
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  // Update sync status
  const { error: updateError } = await supabase
    .from("tg_folder_sync")
    .update({
      last_synced_at: new Date().toISOString(),
      sync_status: error_message ? "error" : "active",
      error_message: error_message ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("slug", slug);

  if (updateError) {
    console.error("[api/telegram-folders/sync] error:", updateError);
    return NextResponse.json({ error: "Failed to update sync status" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
