import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase";

interface ApiKeyAuth {
  userId: string;
  keyId: string;
  scopes: string[];
}

type ApiKeyResult = ApiKeyAuth | { error: NextResponse };

function isError(result: ApiKeyResult): result is { error: NextResponse } {
  return "error" in result;
}

export { isError };

export async function requireApiKey(
  request: Request,
  requiredScope: string = "read"
): Promise<ApiKeyResult> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return {
      error: NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      ),
    };
  }

  const apiKey =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!apiKey || !apiKey.startsWith("sk_live_")) {
    return {
      error: NextResponse.json(
        { error: "Missing or invalid API key" },
        { status: 401 }
      ),
    };
  }

  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  const { data: keyRecord } = await admin
    .from("crm_api_keys")
    .select("id, created_by, scopes, is_active, expires_at, request_count")
    .eq("key_hash", keyHash)
    .single();

  if (!keyRecord || !keyRecord.is_active) {
    return {
      error: NextResponse.json(
        { error: "Invalid or revoked API key" },
        { status: 401 }
      ),
    };
  }

  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return {
      error: NextResponse.json({ error: "API key expired" }, { status: 401 }),
    };
  }

  if (
    !keyRecord.scopes.includes(requiredScope) &&
    !keyRecord.scopes.includes("admin")
  ) {
    return {
      error: NextResponse.json(
        { error: "Insufficient scope" },
        { status: 403 }
      ),
    };
  }

  // Update usage stats (non-blocking)
  admin
    .from("crm_api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      request_count: (keyRecord.request_count ?? 0) + 1,
    })
    .eq("id", keyRecord.id)
    .then(() => {});

  return {
    userId: keyRecord.created_by,
    keyId: keyRecord.id,
    scopes: keyRecord.scopes,
  };
}
