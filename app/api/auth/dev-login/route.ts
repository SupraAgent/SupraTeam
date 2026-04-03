import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export async function POST(request: Request) {
  // Only allow dev login in development — block in production and guarded environments
  if (process.env.NODE_ENV === "production" || process.env.SUPABASE_PROD_GUARD) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const devPassword = process.env.DEV_ACCESS_PASSWORD;
  if (!devPassword) {
    return NextResponse.json({ error: "Dev access not configured" }, { status: 403 });
  }

  const { password } = await request.json();
  if (
    typeof password !== "string" ||
    password.length !== devPassword.length ||
    !timingSafeEqual(Buffer.from(password), Buffer.from(devPassword))
  ) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // Set cookie to HMAC value — must match validation in auth-guard.ts and middleware.ts
  const hmacValue = createHmac("sha256", devPassword).update("dev-auth").digest("hex");
  const response = NextResponse.json({ ok: true });
  response.cookies.set("dev-auth", hmacValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours (reduced from 7 days)
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("dev-auth");
  return response;
}
