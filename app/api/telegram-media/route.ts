import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/telegram-media?file_id=...
 * Proxies a Telegram file (photo/document thumbnail) to the browser.
 * Requires authentication. Streams the file through to avoid exposing bot token.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const fileId = url.searchParams.get("file_id");
  if (!fileId) {
    return NextResponse.json({ error: "file_id required" }, { status: 400 });
  }

  try {
    // Get file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const fileData = await fileRes.json();

    if (!fileData.ok || !fileData.result?.file_path) {
      return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
    }

    // Validate file_path to prevent path traversal
    const filePath: string = fileData.result.file_path;
    if (
      filePath.includes("..") ||
      filePath.startsWith("/") ||
      !/^[a-zA-Z0-9/_\-\.]+$/.test(filePath)
    ) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    // Download the file
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const downloadRes = await fetch(downloadUrl);

    if (!downloadRes.ok) {
      return NextResponse.json({ error: "Failed to download file" }, { status: 502 });
    }

    const contentType = downloadRes.headers.get("content-type") ?? "application/octet-stream";
    const body = downloadRes.body;

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
