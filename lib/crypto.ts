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
 * encryptions (defaults to 1). The version byte is embedded in the ciphertext
 * so decryption is self-describing — callers never need to pass a version.
 *
 * Wire format (hex-encoded):
 *   [version: 1 byte] [iv: 12 bytes] [ciphertext: N bytes] [authTag: 16 bytes]
 *
 * Legacy format (no version prefix) is supported for backward compatibility
 * and can be disabled via DISABLE_LEGACY_DECRYPT=true once all tokens are
 * re-encrypted with the new format.
 */

function getKeyForVersion(version: number): Buffer {
  if (!Number.isInteger(version) || version < 1 || version > 255) {
    throw new Error("Encryption key not available");
  }
  const envVar = version === 1 ? "TOKEN_ENCRYPTION_KEY" : `TOKEN_ENCRYPTION_KEY_V${version}`;
  const key = process.env[envVar];
  if (!key) throw new Error("Encryption key not available");
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error("Encryption key misconfigured");
  }
  return buf;
}

/** Returns the current key version used for new encryptions. */
export function getCurrentKeyVersion(): number {
  const v = process.env.CURRENT_ENCRYPTION_KEY_VERSION;
  if (!v) return 1;
  const parsed = parseInt(v, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 255) {
    throw new Error("Encryption key misconfigured");
  }
  return parsed;
}

/**
 * Encrypt a plaintext token with the current key version.
 * Returns hex string: versionByte + iv + ciphertext + authTag.
 */
export function encryptToken(plaintext: string): string {
  const version = getCurrentKeyVersion();
  const key = getKeyForVersion(version);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const versionBuf = Buffer.from([version]);
  return Buffer.concat([versionBuf, iv, encrypted, tag]).toString("hex");
}

/**
 * Decrypt a hex-encoded token. Auto-detects format:
 *   - New format (version prefix): reads version byte, uses correct key.
 *   - Legacy format (no prefix): assumes version 1. Disable with DISABLE_LEGACY_DECRYPT=true.
 *
 * Legacy detection: try versioned decrypt first. If it fails and legacy is
 * enabled, try the entire buffer as IV + ciphertext + authTag with key v1.
 */
export function decryptToken(hex: string): string {
  const buf = Buffer.from(hex, "hex");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid encrypted token");
  }

  const firstByte = buf[0];

  // Try new format first (version byte + IV + ciphertext + tag)
  if (firstByte >= 1 && firstByte <= 255 && buf.length >= 1 + IV_LENGTH + TAG_LENGTH) {
    try {
      return decryptWithVersion(buf, firstByte);
    } catch {
      // Fall through to legacy attempt if enabled
    }
  }

  // Legacy format: entire buffer is IV + ciphertext + authTag, assume key v1
  if (process.env.DISABLE_LEGACY_DECRYPT === "true") {
    throw new Error("Invalid encrypted token");
  }
  return decryptLegacy(buf);
}

function decryptWithVersion(buf: Buffer, version: number): string {
  const key = getKeyForVersion(version);
  const iv = buf.subarray(1, 1 + IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ciphertext = buf.subarray(1 + IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function decryptLegacy(buf: Buffer): string {
  const key = getKeyForVersion(1);
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
