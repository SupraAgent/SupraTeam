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
 * Legacy format (no version prefix) is auto-detected and treated as version 1.
 */

function getKeyForVersion(version: number): Buffer {
  if (version < 1 || version > 255) throw new Error("Encryption key not available");
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
  return v ? parseInt(v, 10) : 1;
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
 *   - Legacy format (no prefix): assumes version 1.
 *
 * Legacy detection: old format is IV(12) + ciphertext + tag(16), minimum 28 bytes.
 * New format is version(1) + IV(12) + ciphertext + tag(16), minimum 29 bytes.
 * We detect legacy by checking if the first byte is 0x00 (no valid version)
 * or by attempting versioned decrypt first and falling back.
 */
export function decryptToken(hex: string): string {
  const buf = Buffer.from(hex, "hex");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid encrypted token");
  }

  const firstByte = buf[0];

  // New format: first byte is the version (1–255).
  // Legacy format: first byte is the first byte of the 12-byte IV (random, could be anything).
  // Heuristic: try new format first. If it fails AND buf.length matches old format, try legacy.
  if (firstByte >= 1 && buf.length >= 1 + IV_LENGTH + TAG_LENGTH) {
    try {
      return decryptWithVersion(buf, firstByte);
    } catch {
      // Fall through to legacy attempt
    }
  }

  // Legacy format: entire buffer is IV + ciphertext + authTag, assume key v1
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
