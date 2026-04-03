import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomBytes } from "crypto";

// Set deterministic 32-byte hex keys before importing the module
const TEST_KEY = randomBytes(32).toString("hex");
const TEST_KEY_V2 = randomBytes(32).toString("hex");

beforeAll(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("crypto – encryptToken / decryptToken", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
    delete process.env.CURRENT_ENCRYPTION_KEY_VERSION;
    delete process.env.TOKEN_ENCRYPTION_KEY_V2;
    delete process.env.DISABLE_LEGACY_DECRYPT;
  });

  it("roundtrips a simple string", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto");
    const plaintext = "bot123456:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", async () => {
    const { encryptToken } = await import("@/lib/crypto");
    const plaintext = "same-token-value";
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    expect(a).not.toBe(b);
  });

  it("handles empty string", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto");
    const encrypted = encryptToken("");
    expect(decryptToken(encrypted)).toBe("");
  });

  it("handles unicode content", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto");
    const plaintext = "token-with-unicode-\u2603-\u{1F680}";
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it("throws on tampered ciphertext", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto");
    const encrypted = encryptToken("secret");
    // Flip a byte in the middle of the ciphertext
    const buf = Buffer.from(encrypted, "hex");
    buf[Math.floor(buf.length / 2)] ^= 0xff;
    const tampered = buf.toString("hex");
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("throws when TOKEN_ENCRYPTION_KEY is missing", async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    vi.resetModules();
    const { encryptToken: freshEncrypt } = await import("@/lib/crypto");
    expect(() => freshEncrypt("test")).toThrow("Encryption key not available");
    // Restore
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  it("embeds version byte as first byte of ciphertext", async () => {
    const { encryptToken } = await import("@/lib/crypto");
    const encrypted = encryptToken("test");
    const buf = Buffer.from(encrypted, "hex");
    // Default version is 1
    expect(buf[0]).toBe(1);
  });
});

describe("crypto – key versioning", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_V2", TEST_KEY_V2);
    delete process.env.CURRENT_ENCRYPTION_KEY_VERSION;
    delete process.env.DISABLE_LEGACY_DECRYPT;
  });

  it("encrypts with v1 by default and decrypts automatically", async () => {
    const { encryptToken, decryptToken, getCurrentKeyVersion } = await import("@/lib/crypto");
    expect(getCurrentKeyVersion()).toBe(1);
    const encrypted = encryptToken("hello");
    expect(decryptToken(encrypted)).toBe("hello");
  });

  it("encrypts with v2 when CURRENT_ENCRYPTION_KEY_VERSION=2", async () => {
    vi.stubEnv("CURRENT_ENCRYPTION_KEY_VERSION", "2");
    vi.resetModules();
    const { encryptToken, decryptToken, getCurrentKeyVersion } = await import("@/lib/crypto");
    expect(getCurrentKeyVersion()).toBe(2);
    const encrypted = encryptToken("secret-v2");
    // Version byte is 2
    const buf = Buffer.from(encrypted, "hex");
    expect(buf[0]).toBe(2);
    // Auto-detects version on decrypt
    expect(decryptToken(encrypted)).toBe("secret-v2");
  });

  it("decrypts old v1 data after switching to v2", async () => {
    // Encrypt with v1
    const { encryptToken: encV1 } = await import("@/lib/crypto");
    const v1Encrypted = encV1("old-data");

    // Switch to v2
    vi.stubEnv("CURRENT_ENCRYPTION_KEY_VERSION", "2");
    vi.resetModules();
    const { decryptToken: decV2 } = await import("@/lib/crypto");
    // Auto-detects v1 from version byte
    expect(decV2(v1Encrypted)).toBe("old-data");
  });

  it("decrypts legacy format (no version prefix) as v1", async () => {
    // Simulate legacy format: IV(12) + ciphertext + tag(16), no version byte
    const { createCipheriv, randomBytes: rb } = await import("crypto");
    const key = Buffer.from(TEST_KEY, "hex");
    const iv = rb(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update("legacy-data", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const legacyHex = Buffer.concat([iv, encrypted, tag]).toString("hex");

    vi.resetModules();
    const { decryptToken } = await import("@/lib/crypto");
    expect(decryptToken(legacyHex)).toBe("legacy-data");
  });

  it("rejects legacy format when DISABLE_LEGACY_DECRYPT=true", async () => {
    // Create a legacy ciphertext
    const { createCipheriv, randomBytes: rb } = await import("crypto");
    const key = Buffer.from(TEST_KEY, "hex");
    const iv = rb(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update("legacy", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Force first byte to 0x00 so versioned path is skipped
    iv[0] = 0;
    const legacyHex = Buffer.concat([iv, encrypted, tag]).toString("hex");

    vi.stubEnv("DISABLE_LEGACY_DECRYPT", "true");
    vi.resetModules();
    const { decryptToken } = await import("@/lib/crypto");
    expect(() => decryptToken(legacyHex)).toThrow("Invalid encrypted token");
  });

  it("throws generic error when key version env var is missing", async () => {
    vi.resetModules();
    vi.stubEnv("CURRENT_ENCRYPTION_KEY_VERSION", "99");
    const { encryptToken } = await import("@/lib/crypto");
    // Should NOT leak env var name
    expect(() => encryptToken("test")).toThrow("Encryption key not available");
    expect(() => encryptToken("test")).not.toThrow("TOKEN_ENCRYPTION_KEY");
  });

  it("throws on NaN key version", async () => {
    vi.stubEnv("CURRENT_ENCRYPTION_KEY_VERSION", "abc");
    vi.resetModules();
    const { getCurrentKeyVersion } = await import("@/lib/crypto");
    expect(() => getCurrentKeyVersion()).toThrow("Encryption key misconfigured");
  });

  it("throws on negative key version", async () => {
    vi.stubEnv("CURRENT_ENCRYPTION_KEY_VERSION", "-1");
    vi.resetModules();
    const { getCurrentKeyVersion } = await import("@/lib/crypto");
    expect(() => getCurrentKeyVersion()).toThrow("Encryption key misconfigured");
  });
});
