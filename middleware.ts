import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // CORS: restrict API origins to same-origin and configured app URL
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const allowedOrigins = new Set(
      [appUrl, appUrl.replace(/\/$/, "")].filter(Boolean)
    );

    // Block cross-origin requests from untrusted origins
    if (origin && !allowedOrigins.has(origin)) {
      // Allow the TMA and public API endpoints from any origin
      const isPublicPath =
        request.nextUrl.pathname.startsWith("/api/tma/") ||
        request.nextUrl.pathname.startsWith("/api/v1/") ||
        request.nextUrl.pathname.startsWith("/api/public/");
      if (!isPublicPath) {
        return new NextResponse(null, { status: 403 });
      }
    }

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      const headers: Record<string, string> = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
        "Access-Control-Max-Age": "86400",
      };
      if (origin && allowedOrigins.has(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
      }
      return new NextResponse(null, { status: 204, headers });
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/bot/webhook|api/email/webhook|api/email/track|tma|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
