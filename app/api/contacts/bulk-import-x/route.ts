import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();
  const handles: string[] = body.handles;

  if (!Array.isArray(handles) || handles.length === 0) {
    return NextResponse.json({ error: "handles array is required" }, { status: 400 });
  }

  if (handles.length > 100) {
    return NextResponse.json({ error: "Maximum 100 handles per request" }, { status: 400 });
  }

  // Normalize handles: trim, remove @, lowercase for comparison
  const normalized = handles
    .map((h) => h.trim().replace(/^@/, ""))
    .filter((h) => h.length > 0);

  // Dedupe
  const unique = [...new Set(normalized.map((h) => h.toLowerCase()))];
  const handleMap = new Map<string, string>();
  for (const h of normalized) {
    if (!handleMap.has(h.toLowerCase())) {
      handleMap.set(h.toLowerCase(), h);
    }
  }

  // Check which handles already exist (case-insensitive) — only query the incoming handles
  const { data: existing } = await supabase
    .from("crm_contacts")
    .select("x_handle")
    .in("x_handle", [...unique.map((h) => handleMap.get(h) ?? h)]);

  const existingSet = new Set(
    (existing ?? []).map((c: { x_handle: string }) => c.x_handle.toLowerCase())
  );

  const skippedHandles: string[] = [];
  const toCreate: string[] = [];

  for (const lowerHandle of unique) {
    if (existingSet.has(lowerHandle)) {
      skippedHandles.push(handleMap.get(lowerHandle) ?? lowerHandle);
    } else {
      toCreate.push(handleMap.get(lowerHandle) ?? lowerHandle);
    }
  }

  // Batch create contacts
  const createdContacts = [];
  if (toCreate.length > 0) {
    const rows = toCreate.map((handle) => ({
      name: handle,
      x_handle: handle,
      source: "outbound" as const,
      lifecycle_stage: "prospect" as const,
      created_by: user.id,
    }));

    const { data, error } = await supabase
      .from("crm_contacts")
      .insert(rows)
      .select("*");

    if (error) {
      console.error("[bulk-import-x] Insert error:", error);
      return NextResponse.json({ error: "Failed to create contacts" }, { status: 500 });
    }

    createdContacts.push(...(data ?? []));
  }

  return NextResponse.json({
    created: createdContacts.length,
    skipped: skippedHandles.length,
    skipped_handles: skippedHandles,
    contacts: createdContacts,
  });
}
