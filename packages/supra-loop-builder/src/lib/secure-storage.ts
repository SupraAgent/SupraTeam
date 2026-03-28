/**
 * Secure localStorage wrapper for API keys.
 *
 * Uses the Web Crypto API (SubtleCrypto) to encrypt sensitive values
 * before storing them in localStorage. Falls back to plaintext storage
 * when SubtleCrypto is unavailable (e.g., non-HTTPS contexts).
 *
 * The encryption key is derived from a passphrase using PBKDF2,
 * then used with AES-GCM for authenticated encryption.
 */

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 100_000;

function isSubtleCryptoAvailable(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto?.subtle !== "undefined"
  );
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" } as Algorithm,
    false,
    ["deriveKey"] as KeyUsage[]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" } as Pbkdf2Params,
    keyMaterial,
    { name: "AES-GCM", length: 256 } as AesKeyGenParams,
    false,
    ["encrypt", "decrypt"] as KeyUsage[]
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encrypt a value and store it in localStorage.
 * Format: base64(salt) + "." + base64(iv) + "." + base64(ciphertext)
 *
 * Returns { encrypted: true } on success, or { encrypted: false, reason }
 * when SubtleCrypto is unavailable (e.g., non-HTTPS context) and the value
 * was stored in plaintext. Callers should check and warn the user.
 */
export async function secureSet(
  key: string,
  value: string,
  passphrase: string
): Promise<{ encrypted: boolean; reason?: string }> {
  if (!isSubtleCryptoAvailable()) {
    // Fallback: store in plaintext — caller MUST warn the user
    localStorage.setItem(key, `plain:${value}`);
    return {
      encrypted: false,
      reason: "Web Crypto API unavailable. Likely a non-HTTPS context. API key stored in plaintext.",
    };
  }

  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cryptoKey = await deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoder.encode(value)
  );

  const stored = `${toBase64(salt)}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
  localStorage.setItem(key, `enc:${stored}`);
  return { encrypted: true };
}

/**
 * Retrieve and decrypt a value from localStorage.
 * Returns null if the key doesn't exist.
 */
export async function secureGet(
  key: string,
  passphrase: string
): Promise<string | null> {
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  // Handle plaintext fallback values
  if (raw.startsWith("plain:")) {
    return raw.slice(6);
  }

  // Handle legacy unencrypted values (no prefix)
  if (!raw.startsWith("enc:")) {
    return raw;
  }

  if (!isSubtleCryptoAvailable()) {
    // Can't decrypt without SubtleCrypto — return null
    return null;
  }

  try {
    const payload = raw.slice(4); // strip "enc:" prefix
    const parts = payload.split(".");
    if (parts.length !== 3) return null;
    const [saltB64, ivB64, ciphertextB64] = parts;
    const salt = fromBase64(saltB64);
    const iv = fromBase64(ivB64);
    const ciphertext = fromBase64(ciphertextB64);
    const cryptoKey = await deriveKey(passphrase, salt);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv } as AesGcmParams,
      cryptoKey,
      ciphertext as BufferSource
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    // Decryption failed (wrong passphrase, corrupted data)
    return null;
  }
}

/**
 * Remove a secure value from localStorage.
 */
export function secureRemove(key: string): void {
  localStorage.removeItem(key);
}

/**
 * Check if a stored value is encrypted.
 */
export function isEncrypted(key: string): boolean {
  const raw = localStorage.getItem(key);
  return raw?.startsWith("enc:") === true;
}
