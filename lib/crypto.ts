import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Versioned key management for AES-256-GCM encryption.
 *
 * Keys are loaded from environment variables:
 *   - TOKEN_ENCRYPTION_KEY        → version 1 (original, always required)
 *   - TOKEN_ENCRYPTION_KEY_V2     → version 2
 *   - TOKEN_ENCRYPTION_KEY_V3     → version 3
 *   ...etc.
 *
 * CURRENT_ENCRYPTION_KEY_VERSION controls which version is used for new
 * encryptions (defaults to 1). Decryption accepts any version.
 */

function getKeyForVersion(version: number): Buffer {
  const envVar = version === 1 ? "TOKEN_ENCRYPTION_KEY" : `TOKEN_ENCRYPTION_KEY_V${version}`;
  const key = process.env[envVar];
  if (!key) throw new Error(`${envVar} is not set`);
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error(`${envVar} must be exactly 64 hex characters (32 bytes for AES-256)`);
  }
  return buf;
}

/** Returns the current key version used for new encryptions. */
export function getCurrentKeyVersion(): number {
  const v = process.env.CURRENT_ENCRYPTION_KEY_VERSION;
  return v ? parseInt(v, 10) : 1;
}

/** Encrypt a plaintext token. Returns hex string: iv + ciphertext + authTag */
export function encryptToken(plaintext: string): string {
  const version = getCurrentKeyVersion();
  const key = getKeyForVersion(version);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("hex");
}

/**
 * Decrypt a hex-encoded token (iv + ciphertext + authTag).
 * Pass keyVersion to use a specific key; defaults to 1 for backward compatibility.
 */
export function decryptToken(hex: string, keyVersion: number = 1): string {
  const key = getKeyForVersion(keyVersion);
  const buf = Buffer.from(hex, "hex");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
