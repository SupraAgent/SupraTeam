import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/crypto";
import { requireLeadRole } from "@/lib/auth-guard";

type RouteContext = { params: Promise<{ id: string }> };

// GET single bot with status check
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createSupabaseAdmin()!;
  const { data: bot, error } = await admin
    .from("crm_bots")
    .select("*, token:user_tokens(encrypted_token)")
    .eq("id", id)
    .single();

  if (error || !bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  // Verify with Telegram
  let telegramStatus = null;
  if (bot.token?.encrypted_token) {
    try {
      const token = decryptToken(bot.token.encrypted_token);
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await res.json();
      telegramStatus = data.ok ? { ok: true, ...data.result } : { ok: false };

      // Update cached info if changed
      if (data.ok && (data.result.username !== bot.bot_username || data.result.first_name !== bot.bot_first_name)) {
        await admin.from("crm_bots").update({
          bot_username: data.result.username,
          bot_first_name: data.result.first_name,
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", id);
      }
    } catch {
      telegramStatus = { ok: false, error: "Failed to reach Telegram" };
    }
  }

  const { token: _token, ...botWithoutToken } = bot;
  return NextResponse.json({ data: { ...botWithoutToken, telegram_status: telegramStatus }, source: "supabase" });
}

// PATCH — update label, set as default, activate/deactivate. Requires lead role.
export async function PATCH(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createSupabaseAdmin()!;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.label === "string") updates.label = body.label.trim();
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  // Set as default — clear other defaults first
  if (body.is_default === true) {
    await admin.from("crm_bots").update({ is_default: false, updated_at: new Date().toISOString() }).neq("id", id);
    updates.is_default = true;
  }

  const { data: bot, error } = await admin
    .from("crm_bots")
    .update(updates)
    .eq("id", id)
    .select("id, label, bot_username, bot_first_name, bot_telegram_id, is_active, is_default, groups_count, last_verified_at, created_at, updated_at")
    .single();

  if (error) {
    console.error("[api/bots] update error:", error);
    return NextResponse.json({ error: "Failed to update bot" }, { status: 500 });
  }

  return NextResponse.json({ data: bot, source: "supabase" });
}

// DELETE — remove bot registration. Requires lead role.
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;

  const { admin } = auth;

  // Get bot info before deleting
  const { data: bot } = await admin.from("crm_bots").select("id, token_id, is_default").eq("id", id).single();
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  // Unlink groups from this bot
  await admin.from("tg_groups").update({ bot_id: null }).eq("bot_id", id);

  // Delete bot record
  const { error } = await admin.from("crm_bots").delete().eq("id", id);
  if (error) {
    console.error("[api/bots] delete error:", error);
    return NextResponse.json({ error: "Failed to delete bot" }, { status: 500 });
  }

  // Clean up token
  if (bot.token_id) {
    await admin.from("user_tokens").delete().eq("id", bot.token_id);
  }

  // If this was default, promote another bot
  if (bot.is_default) {
    const { data: next } = await admin
      .from("crm_bots")
      .select("id")
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .single();
    if (next) {
      await admin.from("crm_bots").update({ is_default: true }).eq("id", next.id);
    }
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
