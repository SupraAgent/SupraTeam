import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Only allow dev login in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const devPassword = process.env.DEV_ACCESS_PASSWORD;
  if (!devPassword) {
    return NextResponse.json({ error: "Dev access not configured" }, { status: 403 });
  }

  const { password } = await request.json();
  if (password !== devPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("dev-auth", "true", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("dev-auth");
  return response;
}
