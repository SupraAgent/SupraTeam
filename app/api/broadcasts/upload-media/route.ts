import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * POST /api/broadcasts/upload-media
 * Uploads a photo or document to Telegram (via bot API) and returns the file_id.
 * The file_id can then be reused for broadcast sending without re-uploading.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  // We need a "scratch" chat to upload to. Use the bot's own chat (send to saved messages).
  // Actually, Telegram requires a valid chat_id. We'll use the sender's telegram_id.
  const { admin: supabase } = auth;
  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_id")
    .eq("id", auth.user.id)
    .single();

  if (!profile?.telegram_id) {
    return NextResponse.json({ error: "Link your Telegram account in Settings to upload media" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const mediaType = formData.get("media_type") as string | null;

  if (!file || !mediaType) {
    return NextResponse.json({ error: "file and media_type required" }, { status: 400 });
  }

  if (!["photo", "document"].includes(mediaType)) {
    return NextResponse.json({ error: "media_type must be photo or document" }, { status: 400 });
  }

  // Size limits: 10MB for photos, 50MB for documents
  const maxSize = mediaType === "photo" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json({
      error: `File too large. Max ${mediaType === "photo" ? "10MB" : "50MB"} for ${mediaType}s`,
    }, { status: 400 });
  }

  try {
    const method = mediaType === "photo" ? "sendPhoto" : "sendDocument";
    const fileKey = mediaType === "photo" ? "photo" : "document";

    // Build multipart form for Telegram API
    const tgForm = new FormData();
    tgForm.append("chat_id", String(profile.telegram_id));
    tgForm.append(fileKey, file, file.name);
    // Send silently so the user doesn't get a noisy notification
    tgForm.append("disable_notification", "true");

    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      body: tgForm,
    });

    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({ error: data.description ?? "Upload failed" }, { status: 500 });
    }

    // Extract file_id from the response
    let fileId: string;
    if (mediaType === "photo") {
      // Photos have an array of sizes; use the largest
      const photos = data.result.photo as Array<{ file_id: string; width: number }>;
      fileId = photos[photos.length - 1].file_id;
    } else {
      fileId = data.result.document.file_id;
    }

    // Delete the scratch message to keep the DM clean
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: profile.telegram_id, message_id: data.result.message_id }),
      });
    } catch {
      // Best effort — not critical if cleanup fails
    }

    return NextResponse.json({
      ok: true,
      file_id: fileId,
      filename: file.name,
      size: file.size,
      media_type: mediaType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
