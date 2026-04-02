import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_PRIMARY_CONTACTS = 50;

/** POST /api/email/groups/threads — Add thread to group (applies Gmail label or uses junction table) */
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

  // Fetch group with gmail_label_id and connection_id
  const { data: group } = await supabase
    .from("crm_email_groups")
    .select("id, gmail_label_id, connection_id")
    .eq("id", body.group_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Gmail path: apply label to thread
  if (group.gmail_label_id) {
    try {
      const { driver } = await getDriverForUser(user.id, group.connection_id);
      await driver.modifyLabels(body.thread_id, [group.gmail_label_id], []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to apply label";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Register primary contacts for auto-routing (still in DB)
    registerContacts(supabase, body);

    // Return synthetic response matching expected shape
    return NextResponse.json({
      data: {
        id: `gmail-${body.thread_id}-${body.group_id}`,
        group_id: body.group_id,
        thread_id: body.thread_id,
        subject: body.subject ?? null,
        snippet: body.snippet ?? null,
        from_email: body.from_email ?? null,
        from_name: body.from_name ?? null,
        last_message_at: body.last_message_at ?? new Date().toISOString(),
        auto_added: false,
        added_at: new Date().toISOString(),
      },
    }, { status: 201 });
  }

  // IMAP fallback: use junction table
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

  registerContacts(supabase, body);

  return NextResponse.json({ data: threadLink }, { status: 201 });
}

/** DELETE /api/email/groups/threads — Remove thread from group (removes Gmail label or junction row) */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const groupId = req.nextUrl.searchParams.get("group_id");
  const threadId = req.nextUrl.searchParams.get("thread_id");

  if (!groupId || !threadId) {
    return NextResponse.json({ error: "group_id and thread_id required" }, { status: 400 });
  }

  // Fetch group with gmail_label_id
  const { data: group } = await supabase
    .from("crm_email_groups")
    .select("id, gmail_label_id, connection_id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Gmail path: remove label from thread
  if (group.gmail_label_id) {
    try {
      const { driver } = await getDriverForUser(user.id, group.connection_id);
      await driver.modifyLabels(threadId, [], [group.gmail_label_id]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove label";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ data: { deleted: true } });
  }

  // IMAP fallback: delete from junction table
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

/** GET /api/email/groups/threads?group_id=... — Fetch threads for a Gmail-backed group */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const groupId = req.nextUrl.searchParams.get("group_id");
  if (!groupId) {
    return NextResponse.json({ error: "group_id required" }, { status: 400 });
  }

  const { data: group } = await supabase
    .from("crm_email_groups")
    .select("id, gmail_label_id, connection_id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Gmail path: fetch threads by label
  if (group.gmail_label_id) {
    try {
      const { driver } = await getDriverForUser(user.id, group.connection_id);
      const result = await driver.listThreads({ labelIds: [group.gmail_label_id], maxResults: 50 });
      // Map ThreadListItem to EmailGroupThread shape
      const threads = result.threads.map((t) => ({
        id: `gmail-${t.id}`,
        thread_id: t.id,
        subject: t.subject ?? null,
        snippet: t.snippet ?? null,
        from_email: t.from[0]?.email ?? null,
        from_name: t.from[0]?.name ?? null,
        last_message_at: t.lastMessageAt ?? null,
        auto_added: false,
        added_at: t.lastMessageAt ?? new Date().toISOString(),
      }));
      return NextResponse.json({ data: threads });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch threads";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // IMAP fallback: query junction table
  const { data, error } = await supabase
    .from("crm_email_group_threads")
    .select("*")
    .eq("group_id", groupId)
    .order("last_message_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ── Helper: register primary contacts for auto-routing ──────

function registerContacts(supabase: SupabaseClient, body: { group_id?: string; primary_contacts?: { email: string; name?: string }[] }) {
  if (!body.primary_contacts?.length || !body.group_id) return;

  const contacts = body.primary_contacts.slice(0, MAX_PRIMARY_CONTACTS);
  const contactInserts = contacts
    .filter((c) => c.email && /^[^@]+@[^@]+\.[^@]+$/.test(c.email))
    .map((c) => ({
      group_id: body.group_id!,
      email: c.email.toLowerCase(),
      name: c.name ?? null,
    }));

  if (contactInserts.length > 0) {
    supabase
      .from("crm_email_group_contacts")
      .upsert(contactInserts, { onConflict: "group_id,email", ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) console.error("[email-groups] Failed to register contacts:", error.message);
      });
  }
}
