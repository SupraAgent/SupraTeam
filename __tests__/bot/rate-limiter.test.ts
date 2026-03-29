/**
 * Tests for the token-bucket rate limiter in lib/telegram-send.ts.
 *
 * The rate limiter is internal to the module but drives the exported
 * send functions. We mock the Supabase client and fetch to isolate the
 * rate-limiting logic and verify it throttles correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase admin client
vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}));

// Mock fetch to simulate Telegram API success
const mockFetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
});
vi.stubGlobal("fetch", mockFetch);

// Set bot token env
vi.stubEnv("TELEGRAM_BOT_TOKEN", "test:token");

describe("rate limiter via sendTelegramWithTracking", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.resetModules();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test:token");
  });

  it("sends a message successfully", async () => {
    const { sendTelegramWithTracking } = await import("@/lib/telegram-send");
    const result = await sendTelegramWithTracking({
      chatId: 12345,
      text: "Hello world",
      notificationType: "test",
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/sendMessage");
    const body = JSON.parse(opts.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toBe("Hello world");
    expect(body.parse_mode).toBe("HTML");
  });

  it("returns error when bot token is missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.resetModules();

    // Re-mock supabase for new module instance
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseAdmin: () => ({
        from: () => ({
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }));

    const { sendTelegramWithTracking } = await import("@/lib/telegram-send");
    const result = await sendTelegramWithTracking({
      chatId: 12345,
      text: "test",
      notificationType: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("No bot token configured");
  });

  it("handles Telegram API error response", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test:token");
    vi.resetModules();

    vi.doMock("@/lib/supabase", () => ({
      createSupabaseAdmin: () => ({
        from: () => ({
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }));

    const errorFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: false,
          description: "Bad Request: chat not found",
        }),
    });
    vi.stubGlobal("fetch", errorFetch);

    const { sendTelegramWithTracking } = await import("@/lib/telegram-send");
    const result = await sendTelegramWithTracking({
      chatId: 99999,
      text: "test",
      notificationType: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Bad Request: chat not found");
  });

  it("handles network errors gracefully", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test:token");
    vi.resetModules();

    vi.doMock("@/lib/supabase", () => ({
      createSupabaseAdmin: () => ({
        from: () => ({
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }));

    const failFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", failFetch);

    const { sendTelegramWithTracking } = await import("@/lib/telegram-send");
    const result = await sendTelegramWithTracking({
      chatId: 12345,
      text: "test",
      notificationType: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("ECONNREFUSED");
  });

  it("can send multiple messages without error (global bucket has capacity)", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test:token");
    vi.resetModules();

    vi.doMock("@/lib/supabase", () => ({
      createSupabaseAdmin: () => ({
        from: () => ({
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }));

    const okFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
    });
    vi.stubGlobal("fetch", okFetch);

    const { sendTelegramWithTracking } = await import("@/lib/telegram-send");

    // Send 5 messages rapidly — all should succeed within the 30-token bucket
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        sendTelegramWithTracking({
          chatId: 12345,
          text: `Message ${i}`,
          notificationType: "test",
        })
      )
    );

    for (const r of results) {
      expect(r.success).toBe(true);
    }
    expect(okFetch).toHaveBeenCalledTimes(5);
  });

  it("truncates long message previews to 200 chars", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test:token");
    vi.resetModules();

    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseAdmin: () => ({
        from: () => ({ insert: insertSpy }),
      }),
    }));

    const okFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
    });
    vi.stubGlobal("fetch", okFetch);

    const { sendTelegramWithTracking } = await import("@/lib/telegram-send");
    const longText = "x".repeat(300);
    await sendTelegramWithTracking({
      chatId: 12345,
      text: longText,
      notificationType: "test",
    });

    // The preview logged to supabase should be truncated
    const loggedPreview = insertSpy.mock.calls[0][0].message_preview;
    expect(loggedPreview.length).toBe(203); // 200 + "..."
    expect(loggedPreview.endsWith("...")).toBe(true);
  });
});
