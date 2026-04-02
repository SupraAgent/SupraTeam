import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { serverCache } from "@/lib/email/server-cache";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LABEL_PREFIX = "SupraCRM/";

/** GET /api/email/groups?connection_id=... */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const connectionId = req.nextUrl.searchParams.get("connection_id");
  if (!connectionId) {
    return NextResponse.json({ error: "connection_id required" }, { status: 400 });
  }

  // Skip eager thread load for Gmail-backed groups (threads are lazy-loaded from Gmail API)
  // Only load junction threads for IMAP groups
  const { data, error } = await supabase
    .from("crm_email_groups")
    .select("*, crm_email_group_contacts(*)")
    .eq("connection_id", connectionId)
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For IMAP groups (no gmail_label_id), also fetch junction threads
  const imapGroups = (data ?? []).filter((g) => !g.gmail_label_id);
  let threadsByGroup: Record<string, unknown[]> = {};
  if (imapGroups.length > 0) {
    const { data: threads } = await supabase
      .from("crm_email_group_threads")
      .select("*")
      .in("group_id", imapGroups.map((g) => g.id))
      .order("last_message_at", { ascending: false });

    for (const t of threads ?? []) {
      (threadsByGroup[t.group_id] ??= []).push(t);
    }
  }

  const groups = (data ?? []).map((g) => ({
    ...g,
    // Gmail groups: null signals "lazy-load from Gmail API", IMAP groups get their junction threads
    crm_email_group_threads: g.gmail_label_id ? null : (threadsByGroup[g.id] ?? []),
    crm_email_group_contacts: g.crm_email_group_contacts ?? [],
  }));

  return NextResponse.json({ data: groups });
}

/** POST /api/email/groups — Create group (creates Gmail label for Gmail connections) */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { name?: string; color?: string; connection_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }
  if (body.name.trim().length > 100) {
    return NextResponse.json({ error: "Group name too long (max 100 chars)" }, { status: 400 });
  }
  if (!body.connection_id) {
    return NextResponse.json({ error: "connection_id is required" }, { status: 400 });
  }
  if (body.color && !HEX_COLOR_RE.test(body.color)) {
    return NextResponse.json({ error: "color must be a valid hex color (e.g. #3b82f6)" }, { status: 400 });
  }

  const trimmedName = body.name.trim();
  let gmailLabelId: string | null = null;

  // For Gmail connections, create a real Gmail label
  let cachedDriver: Awaited<ReturnType<typeof getDriverForUser>>["driver"] | null = null;
  try {
    const { driver, connection } = await getDriverForUser(user.id, body.connection_id);
    cachedDriver = driver;
    if (connection.provider === "gmail" && driver.createLabel) {
      const label = await driver.createLabel(`${LABEL_PREFIX}${trimmedName}`, body.color);
      gmailLabelId = label.id;
      serverCache.invalidatePrefix(`labels:${user.id}:`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create Gmail label";
    // 409 from Gmail means label already exists — find and reuse it
    if (msg.includes("already exists") || msg.includes("409")) {
      try {
        const labels = await cachedDriver!.listLabels();
        const existing = labels.find(
          (l) => l.name === `${LABEL_PREFIX}${trimmedName}` || l.name === trimmedName
        );
        if (existing) {
          gmailLabelId = existing.id;
          serverCache.invalidatePrefix(`labels:${user.id}:`);
        }
      } catch {
        return NextResponse.json({ error: `Label "${trimmedName}" already exists in Gmail` }, { status: 409 });
      }
      if (!gmailLabelId) {
        return NextResponse.json({ error: `Label "${trimmedName}" already exists in Gmail` }, { status: 409 });
      }
    } else {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Insert group in DB with gmail_label_id — wrapped in try/catch so Gmail label
  // gets cleaned up even if the RPC throws (network timeout, Supabase outage).
  let data: { id: string } & Record<string, unknown>;
  try {
    const result = await supabase.rpc("insert_email_group_atomic", {
      p_user_id: user.id,
      p_connection_id: body.connection_id,
      p_name: trimmedName,
      p_color: body.color ?? "#3b82f6",
      p_gmail_label_id: gmailLabelId,
    });

    if (result.error) {
      // Clean up Gmail label if DB insert fails (reuse cached driver)
      if (gmailLabelId && cachedDriver?.deleteLabel) {
        try { await cachedDriver.deleteLabel(gmailLabelId); } catch { /* best effort */ }
      }
      if (result.error.message.includes("duplicate") || result.error.code === "23505") {
        return NextResponse.json({ error: `Group "${trimmedName}" already exists` }, { status: 409 });
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    data = result.data;
  } catch (rpcErr) {
    // RPC threw — clean up orphaned Gmail label
    if (gmailLabelId && cachedDriver?.deleteLabel) {
      try { await cachedDriver.deleteLabel(gmailLabelId); } catch { /* best effort */ }
    }
    const msg = rpcErr instanceof Error ? rpcErr.message : "Failed to create group";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Fetch full group with nested relations
  const { data: full } = await supabase
    .from("crm_email_groups")
    .select("*, crm_email_group_threads(*), crm_email_group_contacts(*)")
    .eq("id", data.id)
    .single();

  const result = full ?? { ...data, crm_email_group_threads: [], crm_email_group_contacts: [] };
  return NextResponse.json({ data: result }, { status: 201 });
}

/** DELETE /api/email/groups?id=... */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Fetch group to get gmail_label_id and connection_id before deleting
  const { data: group } = await supabase
    .from("crm_email_groups")
    .select("id, gmail_label_id, connection_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Delete Gmail label if it exists
  if (group.gmail_label_id) {
    try {
      const { driver } = await getDriverForUser(user.id, group.connection_id);
      await driver.deleteLabel?.(group.gmail_label_id);
      serverCache.invalidatePrefix(`labels:${user.id}:`);
    } catch {
      // Label may already be gone — continue with DB delete
    }
  }

  const { error } = await supabase
    .from("crm_email_groups")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { deleted: true } });
}

/** PATCH /api/email/groups — Update group (name, color, is_collapsed) */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { id?: string; name?: string; color?: string; is_collapsed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    if (trimmed.length > 100) return NextResponse.json({ error: "name too long (max 100 chars)" }, { status: 400 });
    updates.name = trimmed;
  }
  if (body.color !== undefined) {
    if (!HEX_COLOR_RE.test(body.color)) return NextResponse.json({ error: "color must be a valid hex color" }, { status: 400 });
    updates.color = body.color;
  }
  if (body.is_collapsed !== undefined) updates.is_collapsed = body.is_collapsed;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // If renaming and group has Gmail label, rename the label first
  let oldLabelName: string | null = null;
  let renameGroup: { gmail_label_id: string; connection_id: string } | null = null;
  if (updates.name) {
    const { data: group } = await supabase
      .from("crm_email_groups")
      .select("gmail_label_id, connection_id, name")
      .eq("id", body.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (group?.gmail_label_id) {
      try {
        const { driver } = await getDriverForUser(user.id, group.connection_id);
        await driver.renameLabel?.(group.gmail_label_id, `${LABEL_PREFIX}${updates.name}`);
        serverCache.invalidatePrefix(`labels:${user.id}:`);
        oldLabelName = group.name;
        renameGroup = { gmail_label_id: group.gmail_label_id, connection_id: group.connection_id };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to rename Gmail label";
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }
  }

  const { data, error } = await supabase
    .from("crm_email_groups")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    // Rollback Gmail label rename if DB update fails
    if (renameGroup && oldLabelName) {
      try {
        const { driver } = await getDriverForUser(user.id, renameGroup.connection_id);
        await driver.renameLabel?.(renameGroup.gmail_label_id, `${LABEL_PREFIX}${oldLabelName}`);
      } catch { /* best effort rollback */ }
    }
    if (error.message.includes("duplicate") || error.code === "23505") {
      return NextResponse.json({ error: "A group with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
