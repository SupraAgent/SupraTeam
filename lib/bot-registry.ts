import { createSupabaseAdmin } from "@/lib/supabase";
import { decryptToken } from "@/lib/crypto";

type BotEntry = {
  id: string;
  label: string;
  bot_username: string | null;
  bot_telegram_id: number | null;
  token: string; // decrypted
};

// In-memory cache with 5-minute TTL
const cache = new Map<string, { bot: BotEntry; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

/** Resolve a bot by crm_bots.id — returns decrypted token */
export async function getBotById(botId: string): Promise<BotEntry | null> {
  const cached = cache.get(botId);
  if (cached && cached.expires > Date.now()) return cached.bot;

  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data } = await admin
    .from("crm_bots")
    .select("id, label, bot_username, bot_telegram_id, token:user_tokens(encrypted_token)")
    .eq("id", botId)
    .eq("is_active", true)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenRaw = data?.token as any;
  const encryptedToken = Array.isArray(tokenRaw) ? tokenRaw[0]?.encrypted_token : tokenRaw?.encrypted_token;
  if (!encryptedToken) return null;

  const entry: BotEntry = {
    id: data.id,
    label: data.label,
    bot_username: data.bot_username,
    bot_telegram_id: data.bot_telegram_id,
    token: decryptToken(encryptedToken),
  };

  cache.set(botId, { bot: entry, expires: Date.now() + CACHE_TTL });
  return entry;
}

/** Get the default bot */
export async function getDefaultBot(): Promise<BotEntry | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data } = await admin
    .from("crm_bots")
    .select("id, label, bot_username, bot_telegram_id, token:user_tokens(encrypted_token)")
    .eq("is_default", true)
    .eq("is_active", true)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultTokenRaw = data?.token as any;
  const defaultEncryptedToken = Array.isArray(defaultTokenRaw) ? defaultTokenRaw[0]?.encrypted_token : defaultTokenRaw?.encrypted_token;
  if (!defaultEncryptedToken) {
    // Fallback: env var for backwards compat
    const envToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!envToken) return null;
    return { id: "env", label: "Default (env)", bot_username: null, bot_telegram_id: null, token: envToken };
  }

  const entry: BotEntry = {
    id: data.id,
    label: data.label,
    bot_username: data.bot_username,
    bot_telegram_id: data.bot_telegram_id,
    token: decryptToken(defaultEncryptedToken),
  };

  cache.set(data.id, { bot: entry, expires: Date.now() + CACHE_TTL });
  return entry;
}

/** Get all active bots (for setting up webhooks) */
export async function getAllActiveBots(): Promise<BotEntry[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const { data } = await admin
    .from("crm_bots")
    .select("id, label, bot_username, bot_telegram_id, token:user_tokens(encrypted_token)")
    .eq("is_active", true)
    .order("is_default", { ascending: false });

  if (!data) return [];

  return data
    .filter((b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = b.token as any;
      return !!(Array.isArray(t) ? t[0]?.encrypted_token : t?.encrypted_token);
    })
    .map((b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = b.token as any;
      const et = Array.isArray(t) ? t[0].encrypted_token : t.encrypted_token;
      return {
        id: b.id,
        label: b.label,
        bot_username: b.bot_username,
        bot_telegram_id: b.bot_telegram_id,
        token: decryptToken(et),
      };
    });
}

/** Invalidate cache for a specific bot */
export function invalidateBotCache(botId: string) {
  cache.delete(botId);
}
