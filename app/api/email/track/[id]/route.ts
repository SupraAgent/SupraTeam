import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase";

// 1x1 transparent GIF pixel
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

type Params = { params: Promise<{ id: string }> };

/** GET: Tracking pixel — records email open event */
export async function GET(request: Request, { params }: Params) {
  const { id: trackingId } = await params;

  // Record the open
  try {
    const admin = createSupabaseAdmin();
    if (!admin) throw new Error("No admin client");
    await admin.from("crm_email_tracking_events").insert({
      tracking_id: trackingId,
      event_type: "open",
      user_agent: request.headers.get("user-agent") ?? null,
      ip_hash: hashIp(request.headers.get("x-forwarded-for") ?? "unknown"),
      opened_at: new Date().toISOString(),
    });
  } catch {
    // Don't fail — tracking is best-effort
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

/** SHA-256 hash with salt for privacy — non-reversible, no raw IP stored */
function hashIp(ip: string): string {
  const salt = process.env.TOKEN_ENCRYPTION_KEY ?? "tracking-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}
