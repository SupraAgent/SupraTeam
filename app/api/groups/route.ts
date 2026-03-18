import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: groups, error } = await supabase
    .from("tg_groups")
    .select("*")
    .order("group_name");

  if (error) {
    console.error("[api/groups] error:", error);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }

  return NextResponse.json({ groups: groups ?? [] });
}
