import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type AuthResult =
  | { user: User; admin: NonNullable<ReturnType<typeof createSupabaseAdmin>> }
  | { error: NextResponse };

/**
 * Authenticate the current request and return the user + admin client.
 * Returns a NextResponse error if unauthenticated or Supabase not configured.
 */
export async function requireAuth(): Promise<AuthResult> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
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
