import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomBytes } from "crypto";

// Set a deterministic 32-byte hex key before importing the module
const TEST_KEY = randomBytes(32).toString("hex");

beforeAll(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("crypto – encryptToken / decryptToken", () => {
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
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    // Re-import won't help since module is cached, so we test getKey indirectly
    // by deleting the env var and calling the functions
    const origKey = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;

    // Need a fresh module to test this — use dynamic import with cache bust
    vi.resetModules();
    const { encryptToken: freshEncrypt } = await import("@/lib/crypto");
    expect(() => freshEncrypt("test")).toThrow("TOKEN_ENCRYPTION_KEY is not set");

    // Restore
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });
});
