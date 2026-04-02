import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const MAX_PRIMARY_CONTACTS = 50;

/** POST /api/email/groups/threads — Add thread to group + register primary contacts */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: {
    group_id?: string;
    thread_id?: string;
    subject?: string;
    snippet?: string;
    from_email?: string;
    from_name?: string;
    last_message_at?: string;
    /** Primary contacts (from field, not CC) to auto-route future emails */
    primary_contacts?: { email: string; name?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.group_id || !body.thread_id) {
    return NextResponse.json({ error: "group_id and thread_id required" }, { status: 400 });
  }

  // Defense in depth: verify the user owns this group
  const { data: ownerCheck } = await supabase
    .from("crm_email_groups")
    .select("id")
    .eq("id", body.group_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownerCheck) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Upsert thread into group
  const { data: threadLink, error: threadErr } = await supabase
    .from("crm_email_group_threads")
    .upsert(
      {
        group_id: body.group_id,
        thread_id: body.thread_id,
        subject: body.subject ?? null,
        snippet: body.snippet ?? null,
        from_email: body.from_email ?? null,
        from_name: body.from_name ?? null,
        last_message_at: body.last_message_at ?? new Date().toISOString(),
      },
      { onConflict: "group_id,thread_id" }
    )
    .select()
    .single();

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }

  // Register primary contacts for auto-routing
  let contactWarning: string | undefined;
  if (body.primary_contacts && body.primary_contacts.length > 0) {
    const contacts = body.primary_contacts.slice(0, MAX_PRIMARY_CONTACTS);
    const contactInserts = contacts
      .filter((c) => c.email && /^[^@]+@[^@]+$/.test(c.email))
      .map((c) => ({
        group_id: body.group_id!,
        email: c.email.toLowerCase(),
        name: c.name ?? null,
      }));

    if (contactInserts.length > 0) {
      const { error: contactErr } = await supabase
        .from("crm_email_group_contacts")
        .upsert(contactInserts, { onConflict: "group_id,email", ignoreDuplicates: true });

      if (contactErr) {
        contactWarning = `Thread added but contact auto-routing failed: ${contactErr.message}`;
      }
    }
  }

  return NextResponse.json({
    data: threadLink,
    ...(contactWarning ? { warning: contactWarning } : {}),
  }, { status: 201 });
}

/** DELETE /api/email/groups/threads — Remove thread from group */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("group_id");
  const threadId = searchParams.get("thread_id");

  if (!groupId || !threadId) {
    return NextResponse.json({ error: "group_id and thread_id required" }, { status: 400 });
  }

  // Defense in depth: verify the user owns this group
  const { data: ownerCheck } = await supabase
    .from("crm_email_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownerCheck) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("crm_email_group_threads")
    .delete()
    .eq("group_id", groupId)
    .eq("thread_id", threadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: true } });
}
