import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET /api/email/threads/[id]/tags — Get tags for a thread */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: threadId } = await params;

  const { data } = await supabase
    .from("crm_email_thread_tags")
    .select("id, tag_id, auto_tagged, tagged_at, crm_email_tags(id, name, color, icon)")
    .eq("thread_id", threadId)
    .eq("tagged_by", user.id);

  return NextResponse.json({ data: data ?? [] });
}

/** POST /api/email/threads/[id]/tags — Add a tag to a thread */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: threadId } = await params;

  const body = await req.json();
  if (!body.tag_id) {
    return NextResponse.json({ error: "tag_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_email_thread_tags")
    .insert({
      thread_id: threadId,
      tag_id: body.tag_id,
      tagged_by: user.id,
      auto_tagged: body.auto_tagged ?? false,
    })
    .select("id, tag_id, auto_tagged, tagged_at, crm_email_tags(id, name, color, icon)")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Tag already applied" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

/** DELETE /api/email/threads/[id]/tags?tagId=uuid — Remove a tag from a thread */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: threadId } = await params;

  const tagId = req.nextUrl.searchParams.get("tagId");
  if (!tagId) return NextResponse.json({ error: "tagId required" }, { status: 400 });

  await supabase
    .from("crm_email_thread_tags")
    .delete()
    .eq("thread_id", threadId)
    .eq("tag_id", tagId)
    .eq("tagged_by", user.id);

  return NextResponse.json({ ok: true });
}
