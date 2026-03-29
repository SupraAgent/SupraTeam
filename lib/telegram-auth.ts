import crypto from "crypto";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

/**
 * Validate Telegram WebApp initData using HMAC-SHA256.
 * Returns the parsed user if valid, null otherwise.
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string
): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    // Check auth_date freshness (< 1 hour)
    const authDate = params.get("auth_date");
    if (!authDate) return null;
    const authTimestamp = parseInt(authDate, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authTimestamp > 3600) return null;

    // Build data-check-string (alphabetically sorted, excluding hash)
    params.delete("hash");
    const entries = Array.from(params.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const dataCheckString = entries
      .map(([key, val]) => `${key}=${val}`)
      .join("\n");

    // HMAC-SHA256 verification
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const checkHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    try {
      if (!crypto.timingSafeEqual(Buffer.from(checkHash, "hex"), Buffer.from(hash, "hex"))) return null;
    } catch {
      return null;
    }

    // Parse user
    const userStr = params.get("user");
    if (!userStr) return null;
    const user = JSON.parse(userStr) as TelegramUser;
    if (!user.id || !user.first_name) return null;

    return user;
  } catch {
    return null;
  }
}
