/**
 * Register the SuperDapp bot in crm_bots.
 *
 * Usage:
 *   npx tsx scripts/register-superdapp-bot.ts
 *
 * Requires these env vars (loaded from your local env):
 *   - SUPERDAPP_BOT_TOKEN (Telegram bot token from @BotFather)
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - TOKEN_ENCRYPTION_KEY
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { encryptToken } from "../lib/crypto";

const BOT_TOKEN = process.env.SUPERDAPP_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("Missing SUPERDAPP_BOT_TOKEN env var");
  process.exit(1);
}
const BOT_TELEGRAM_ID = Number(BOT_TOKEN.split(":")[0]);
const BOT_USERNAME = process.env.SUPERDAPP_BOT_USERNAME || "suprafund_bot";
const BOT_FIRST_NAME = process.env.SUPERDAPP_BOT_FIRST_NAME || "SupraFund";
const BOT_LABEL = process.env.SUPERDAPP_BOT_LABEL || "SuperDapp Fund";

async function main() {
  const url = process["env"]["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process["env"]["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. Encrypt and store token
  const encrypted = encryptToken(BOT_TOKEN!);
  const providerKey = `telegram_bot_${BOT_TELEGRAM_ID}`;

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("user_tokens")
    .insert({ provider_key: providerKey, encrypted_token: encrypted, provider: "telegram_bot" })
    .select("id")
    .single();

  if (tokenErr) {
    console.error("Token insert error:", tokenErr);
    process.exit(1);
  }
  console.log("Token stored:", tokenRow.id);

  // 2. Insert bot record
  const { data: bot, error: botErr } = await supabase
    .from("crm_bots")
    .insert({
      label: BOT_LABEL,
      bot_username: BOT_USERNAME,
      bot_first_name: BOT_FIRST_NAME,
      bot_telegram_id: BOT_TELEGRAM_ID,
      token_id: tokenRow.id,
      is_active: true,
      is_default: false,
    })
    .select("id")
    .single();

  if (botErr) {
    console.error("Bot insert error:", botErr);
    process.exit(1);
  }

  console.log("\nBot registered successfully!");
  console.log("Bot ID:", bot.id);
  console.log("\nAdd this to your deployment env vars:");
  console.log(`  SUPERDAPP_BOT_ID=${bot.id}`);
}

main();
