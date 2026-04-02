import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { serverCache } from "@/lib/email/server-cache";

const LABEL_PREFIX = "SupraCRM/";

/** Default groups created for every new connection */
const DEFAULT_GROUPS = [
  { name: "VIP", color: "#eab308" },
  { name: "Action Required", color: "#ef4444" },
  { name: "Pending Response", color: "#f59e0b" },
  { name: "Read Later", color: "#3b82f6" },
  { name: "Newsletter", color: "#8b5cf6" },
  { name: "Follow Up", color: "#f97316" },
  { name: "Waiting On", color: "#06b6d4" },
] as const;

/**
 * POST /api/email/groups/bootstrap?connection_id=...
 *
 * Creates default SupraCRM labels in Gmail + DB rows for a connection.
 * Idempotent — skips labels that already exist.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const connectionId = req.nextUrl.searchParams.get("connection_id");
  if (!connectionId) {
    return NextResponse.json({ error: "connection_id required" }, { status: 400 });
  }

  // Check if we already bootstrapped (any SupraCRM group exists for this connection)
  const { data: existing } = await supabase
    .from("crm_email_groups")
    .select("id")
    .eq("user_id", user.id)
    .eq("connection_id", connectionId)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ data: { created: 0, message: "Already bootstrapped" } });
  }

  let driver: Awaited<ReturnType<typeof getDriverForUser>>["driver"];
  let connection: Awaited<ReturnType<typeof getDriverForUser>>["connection"];
  try {
    const result = await getDriverForUser(user.id, connectionId);
    driver = result.driver;
    connection = result.connection;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to connect";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const isGmail = connection.provider === "gmail" && !!driver.createLabel;
  let created = 0;

  for (const group of DEFAULT_GROUPS) {
    let gmailLabelId: string | null = null;

    // Create Gmail label
    if (isGmail) {
      try {
        const label = await driver.createLabel!(`${LABEL_PREFIX}${group.name}`, group.color);
        gmailLabelId = label.id;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        // Skip if already exists
        if (msg.includes("already exists") || msg.includes("409")) continue;
        // Skip on error, don't fail the whole batch
        continue;
      }
    }

    // Insert DB row
    try {
      const result = await supabase.rpc("insert_email_group_atomic", {
        p_user_id: user.id,
        p_connection_id: connectionId,
        p_name: group.name,
        p_color: group.color,
        p_gmail_label_id: gmailLabelId,
      });

      if (result.error) {
        // Clean up Gmail label if DB fails
        if (gmailLabelId && driver.deleteLabel) {
          try { await driver.deleteLabel(gmailLabelId); } catch { /* best effort */ }
        }
        continue;
      }
      created++;
    } catch {
      if (gmailLabelId && driver.deleteLabel) {
        try { await driver.deleteLabel(gmailLabelId); } catch { /* best effort */ }
      }
    }
  }

  if (created > 0) {
    serverCache.invalidatePrefix(`labels:${user.id}:`);
  }

  return NextResponse.json({ data: { created, message: `Created ${created} default groups` } }, { status: 201 });
}
