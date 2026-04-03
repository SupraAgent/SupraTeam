import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * Health check endpoint for Railway load balancer.
 * Returns 200 if the app is running and can reach Supabase.
 * Railway pings this to know the service is healthy.
 */
export async function GET() {
  // Minimal health check — no integration details or uptime leaked to unauthenticated callers
  let supabaseOk = false;
  try {
    const admin = createSupabaseAdmin();
    if (admin) {
      const { error } = await admin.from("pipeline_stages").select("id").limit(1);
      supabaseOk = !error;
    }
  } catch {
    supabaseOk = false;
  }

  const healthy = supabaseOk;

  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded" },
    { status: healthy ? 200 : 503 }
  );
}
