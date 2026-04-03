import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomBytes } from "crypto";

// Set a deterministic 32-byte hex key before importing the module
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
    // Reset to version 1 by default
    delete process.env.CURRENT_ENCRYPTION_KEY_VERSION;
    delete process.env.TOKEN_ENCRYPTION_KEY_V2;
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
    expect(() => freshEncrypt("test")).toThrow("TOKEN_ENCRYPTION_KEY is not set");
    // Restore
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });
});

describe("crypto – key versioning", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_V2", TEST_KEY_V2);
    delete process.env.CURRENT_ENCRYPTION_KEY_VERSION;
  });

  it("encrypts with v1 by default and decrypts with v1", async () => {
    const { encryptToken, decryptToken, getCurrentKeyVersion } = await import("@/lib/crypto");
    expect(getCurrentKeyVersion()).toBe(1);
    const encrypted = encryptToken("hello");
    expect(decryptToken(encrypted, 1)).toBe("hello");
  });

  it("encrypts with v2 when CURRENT_ENCRYPTION_KEY_VERSION=2", async () => {
    vi.stubEnv("CURRENT_ENCRYPTION_KEY_VERSION", "2");
    vi.resetModules();
    const { encryptToken, decryptToken, getCurrentKeyVersion } = await import("@/lib/crypto");
    expect(getCurrentKeyVersion()).toBe(2);
    const encrypted = encryptToken("secret-v2");
    // Decrypt with v2 key succeeds
    expect(decryptToken(encrypted, 2)).toBe("secret-v2");
    // Decrypt with v1 key fails (wrong key)
    expect(() => decryptToken(encrypted, 1)).toThrow();
  });

  it("decrypts old v1 data even when current version is v2", async () => {
    // Encrypt with v1
    const { encryptToken: encV1 } = await import("@/lib/crypto");
    const v1Encrypted = encV1("old-data");

    // Switch to v2
    vi.stubEnv("CURRENT_ENCRYPTION_KEY_VERSION", "2");
    vi.resetModules();
    const { decryptToken: decV2 } = await import("@/lib/crypto");
    // Still decryptable with explicit v1
    expect(decV2(v1Encrypted, 1)).toBe("old-data");
  });

  it("throws when referenced key version env var is missing", async () => {
    vi.resetModules();
    const { decryptToken } = await import("@/lib/crypto");
    expect(() => decryptToken("aabbccdd", 3)).toThrow("TOKEN_ENCRYPTION_KEY_V3 is not set");
  });
});
