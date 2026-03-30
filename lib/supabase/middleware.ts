import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the session (important for server components)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/apply") ||
    pathname.startsWith("/tma") ||
    pathname === "/privacy" ||
    pathname === "/terms";

  // Dev access bypass: cookie set by /api/auth/dev-login (dev only)
  // Uses Web Crypto API (edge-runtime compatible) to validate HMAC
  let hasDevAuth = false;
  if (process.env.NODE_ENV !== "production" && process.env.DEV_ACCESS_PASSWORD) {
    const devCookie = request.cookies.get("dev-auth")?.value;
    if (devCookie) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(process.env.DEV_ACCESS_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode("dev-auth"));
      const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
      // Constant-time comparison (manual XOR loop because middleware runs in edge runtime
      // where Node.js crypto.timingSafeEqual is not available)
      if (devCookie.length === expected.length) {
        let diff = 0;
        for (let i = 0; i < devCookie.length; i++) diff |= devCookie.charCodeAt(i) ^ expected.charCodeAt(i);
        hasDevAuth = diff === 0;
      }
    }
  }

  if ((user || hasDevAuth) && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Unauthenticated users on non-public routes: redirect to login
  if (!user && !hasDevAuth && !isPublicRoute && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}
