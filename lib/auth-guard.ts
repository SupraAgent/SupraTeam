import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import type { SupabaseClient, User } from "@supabase/supabase-js";

interface AuthSuccess {
  user: User;
  /** Scoped client — respects RLS using the user's JWT. Use by default. */
  supabase: SupabaseClient;
  /** Admin client — bypasses RLS. Use only for cross-user ops (broadcasts, cron, bot). */
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>;
}

type AuthResult = AuthSuccess | { error: NextResponse };

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
 * Authenticate the current request and return the user + both clients.
 *
 * - `supabase` — scoped client that respects RLS (use by default)
 * - `admin` — service-role client that bypasses RLS (use for cross-user ops)
 *
 * Returns a NextResponse error if unauthenticated or Supabase not configured.
 */
export async function requireAuth(): Promise<AuthResult> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  }

  // Dev access bypass — disabled in production, validates cookie against password
  if (process.env.DEV_ACCESS_PASSWORD && process.env.NODE_ENV !== "production") {
    const cookieStore = await cookies();
    const devCookie = cookieStore.get("dev-auth")?.value;
    if (devCookie) {
      const expected = createHmac("sha256", process.env.DEV_ACCESS_PASSWORD).update("dev-auth").digest("hex");
      if (devCookie === expected) {
        return { user: DEV_USER, supabase: admin, admin };
      }
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

  return { user, supabase, admin };
}

const LEAD_ROLES = ["bd_lead", "marketing_lead", "admin_lead"];

/**
 * Require authenticated user with a CRM lead role.
 * Use for destructive operations (kick, remove, access management).
 */
export async function requireLeadRole(): Promise<AuthResult> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;

  const { user, supabase, admin } = auth;
  const { data: profile } = await admin
    .from("profiles")
    .select("crm_role")
    .eq("id", user.id)
    .single();

  if (!profile?.crm_role || !LEAD_ROLES.includes(profile.crm_role)) {
    return { error: NextResponse.json({ error: "Insufficient permissions — lead role required" }, { status: 403 }) };
  }

  return { user, supabase, admin };
}
