import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const sort = searchParams.get("sort") ?? "newest";

  let query = supabase
    .from("crm_feature_suggestions")
    .select("*");

  if (status && status !== "all") {
    query = query.eq("status", status);
  }
  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  if (sort === "score") {
    query = query.order("cpo_score", { ascending: false, nullsFirst: false });
  } else if (sort === "upvotes") {
    query = query.order("upvotes", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query.limit(100);

  if (error) {
    console.error("[suggestions] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }

  return NextResponse.json({ suggestions: data ?? [], source: "supabase" });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();
  const { title, description, category } = body;

  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
  }

  // Get submitter name
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const { data: suggestion, error } = await supabase
    .from("crm_feature_suggestions")
    .insert({
      title: title.trim(),
      description: description.trim(),
      category: category || "other",
      submitted_by: user.id,
      submitted_by_name: profile?.display_name ?? user.email ?? "Unknown",
    })
    .select()
    .single();

  if (error) {
    console.error("[suggestions] POST error:", error);
    return NextResponse.json({ error: "Failed to create suggestion" }, { status: 500 });
  }

  return NextResponse.json({ suggestion, ok: true });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();
  const { id, action } = body;

  if (!id) {
    return NextResponse.json({ error: "Suggestion ID required" }, { status: 400 });
  }

  // Handle upvote toggle
  if (action === "upvote") {
    const { data: existing } = await supabase
      .from("crm_feature_suggestions")
      .select("upvotes, upvoted_by")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const upvotedBy: string[] = existing.upvoted_by ?? [];
    const hasVoted = upvotedBy.includes(user.id);

    const newUpvotedBy = hasVoted
      ? upvotedBy.filter((uid: string) => uid !== user.id)
      : [...upvotedBy, user.id];

    const { error } = await supabase
      .from("crm_feature_suggestions")
      .update({
        upvotes: newUpvotedBy.length,
        upvoted_by: newUpvotedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to upvote" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, upvotes: newUpvotedBy.length, voted: !hasVoted });
  }

  // Handle status update
  if (action === "update_status") {
    const { status: newStatus } = body;
    const { error } = await supabase
      .from("crm_feature_suggestions")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
