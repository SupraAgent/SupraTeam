import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type AuthResult =
  | { user: User; admin: NonNullable<ReturnType<typeof createSupabaseAdmin>> }
  | { error: NextResponse };

/** Synthetic user for dev-access sessions (no real Supabase auth). */
const DEV_USER: User = {
  id: "dev-00000000-0000-0000-0000-000000000000",
  email: "dev@supracrm.local",
  app_metadata: {},
  user_metadata: { full_name: "Dev User" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as User;

/**
 * Authenticate the current request and return the user + admin client.
 * Returns a NextResponse error if unauthenticated or Supabase not configured.
 */
export async function requireAuth(): Promise<AuthResult> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  }

  // Dev access bypass — disabled in production
  if (process.env.DEV_ACCESS_PASSWORD && process.env.NODE_ENV !== "production") {
    const cookieStore = await cookies();
    if (cookieStore.get("dev-auth")?.value === "true") {
      return { user: DEV_USER, admin };
    }
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  return { user, admin };
}
