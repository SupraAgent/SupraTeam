import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmailAddress } from "@/lib/email/types";

// ── Mock helpers ────────────────────────────────────────────
// We need to mock ImapFlow, nodemailer, and mailparser before importing ImapDriver.

/** Create a mock IMAP fetch message */
function makeFetchMsg(overrides: {
  uid: number;
  flags?: Set<string>;
  envelope?: Record<string, unknown>;
  source?: Buffer;
  threadId?: string;
}) {
  return {
    uid: overrides.uid,
    flags: overrides.flags ?? new Set<string>(["\\Seen"]),
    envelope: overrides.envelope ?? {
      from: [{ value: [{ name: "Alice", address: "alice@test.com" }] }],
      to: [{ value: [{ name: "Bob", address: "bob@test.com" }] }],
      cc: [],
      subject: "Test Subject",
      date: new Date("2024-01-15T10:00:00Z"),
      messageId: "<msg-001@test.com>",
    },
    source: overrides.source ?? Buffer.from(
      `From: Alice <alice@test.com>\r\nTo: Bob <bob@test.com>\r\nSubject: Test Subject\r\nMessage-ID: <msg-001@test.com>\r\nDate: Mon, 15 Jan 2024 10:00:00 +0000\r\nContent-Type: text/plain\r\n\r\nHello World`
    ),
    threadId: overrides.threadId,
  };
}

/** Create an async iterable from an array (simulates IMAP fetch streams) */
async function* asyncIter<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

// ── Mocks ───────────────────────────────────────────────────

const mockLock = { release: vi.fn() };
const mockSearch = vi.fn<(query: unknown) => Promise<number[]>>();
const mockFetch = vi.fn();
const mockMessageMove = vi.fn();
const mockMessageFlagsAdd = vi.fn();
const mockMessageFlagsRemove = vi.fn();
const mockAppend = vi.fn();
const mockList = vi.fn();
const mockConnect = vi.fn();
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();
const mockSendMail = vi.fn();

const mockImapClient = {
  connect: mockConnect,
  getMailboxLock: vi.fn().mockResolvedValue(mockLock),
  search: mockSearch,
  fetch: mockFetch,
  messageMove: mockMessageMove,
  messageFlagsAdd: mockMessageFlagsAdd,
  messageFlagsRemove: mockMessageFlagsRemove,
  append: mockAppend,
  list: mockList,
  logout: mockLogout,
  close: mockClose,
  usable: true,
  mailbox: { exists: 50 },
};

// Mock imapflow module — must use regular function (not arrow) for `new` to work
vi.mock("imapflow", () => ({
  ImapFlow: vi.fn().mockImplementation(function () {
    return mockImapClient;
  }),
}));

// Mock nodemailer
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
  createTransport: vi.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

// Mock mailparser — return structured ParsedMail
vi.mock("mailparser", () => ({
  simpleParser: vi.fn(async (source: Buffer) => {
    const text = source.toString();
    // Parse basic RFC822 headers from the buffer
    const fromMatch = text.match(/From:\s*(.+?)(?:\r?\n(?!\s))/);
    const toMatch = text.match(/To:\s*(.+?)(?:\r?\n(?!\s))/);
    const subjectMatch = text.match(/Subject:\s*(.+?)(?:\r?\n(?!\s))/);
    const messageIdMatch = text.match(/Message-ID:\s*(.+?)(?:\r?\n(?!\s))/);
    const bodyMatch = text.match(/\r?\n\r?\n([\s\S]*)/);

    return {
      from: fromMatch
        ? { value: [{ name: fromMatch[1].match(/"?([^"<]*)"?\s*</)?.[1]?.trim() ?? "", address: fromMatch[1].match(/<([^>]+)>/)?.[1] ?? fromMatch[1].trim() }] }
        : undefined,
      to: toMatch
        ? { value: [{ name: toMatch[1].match(/"?([^"<]*)"?\s*</)?.[1]?.trim() ?? "", address: toMatch[1].match(/<([^>]+)>/)?.[1] ?? toMatch[1].trim() }] }
        : undefined,
      cc: undefined,
      bcc: undefined,
      subject: subjectMatch?.[1]?.trim() ?? "(no subject)",
      html: undefined,
      textAsHtml: undefined,
      text: bodyMatch?.[1]?.trim() ?? "",
      date: new Date("2024-01-15T10:00:00Z"),
      messageId: messageIdMatch?.[1]?.trim(),
      attachments: [],
    };
  }),
}));

// Must import after mocks
import { ImapDriver } from "@/lib/email/imap-driver";
import { encodeMessageRef } from "@/lib/email/message-ref";

// ── Tests ───────────────────────────────────────────────────

describe("ImapDriver", () => {
  let driver: ImapDriver;

  beforeEach(() => {
    vi.clearAllMocks();
    mockImapClient.usable = true;
    mockImapClient.mailbox = { exists: 50 };
    mockSearch.mockResolvedValue([]);
    mockFetch.mockReturnValue(asyncIter([]));
    mockSendMail.mockResolvedValue({ messageId: "<sent-001@test.com>" });

    driver = new ImapDriver({ email: "test@gmail.com", appPassword: "app-pass" });
    driver.userId = "user-123";
  });

  afterEach(async () => {
    await driver.cleanup();
  });

  // ── archive ─────────────────────────────────────────────
  describe("archive", () => {
    it("opens INBOX (not All Mail) and moves to All Mail", async () => {
      mockSearch.mockResolvedValue([10, 11]);

      await driver.archive("thread-abc");

      // Must lock INBOX — archiving means removing from INBOX
      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith("INBOX");
      expect(mockMessageMove).toHaveBeenCalledWith([10, 11], "[Gmail]/All Mail", { uid: true });
    });

    it("does nothing when no UIDs found", async () => {
      mockSearch.mockResolvedValue([]);

      await driver.archive("thread-xyz");

      expect(mockMessageMove).not.toHaveBeenCalled();
    });

    it("releases the lock even on error", async () => {
      mockSearch.mockRejectedValue(new Error("search failed"));

      // findThreadUids catches search errors and falls back to parseInt
      await driver.archive("not-a-number");

      expect(mockLock.release).toHaveBeenCalled();
    });
  });

  // ── trash ───────────────────────────────────────────────
  describe("trash", () => {
    it("opens All Mail and moves to Trash", async () => {
      mockSearch.mockResolvedValue([10]);

      await driver.trash("thread-abc");

      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith("[Gmail]/All Mail");
      expect(mockMessageMove).toHaveBeenCalledWith([10], "[Gmail]/Trash", { uid: true });
    });
  });

  // ── forward ─────────────────────────────────────────────
  describe("forward", () => {
    it("fetches message from the folder encoded in the ref", async () => {
      const qualifiedRef = encodeMessageRef("INBOX", 42);
      const fetchMsg = makeFetchMsg({ uid: 42 });
      mockFetch.mockReturnValue(asyncIter([fetchMsg]));

      await driver.forward(qualifiedRef, {
        to: [{ name: "Charlie", email: "charlie@test.com" }],
      });

      // Should lock INBOX (decoded from ref), NOT All Mail
      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith("INBOX");
      expect(mockSendMail).toHaveBeenCalledTimes(1);

      const sentMail = mockSendMail.mock.calls[0][0];
      expect(sentMail.subject).toBe("Fwd: Test Subject");
      expect(sentMail.to).toContain("charlie@test.com");
    });

    it("defaults to All Mail for legacy bare UID refs", async () => {
      const fetchMsg = makeFetchMsg({ uid: 42 });
      mockFetch.mockReturnValue(asyncIter([fetchMsg]));

      await driver.forward("42", {
        to: [{ name: "Charlie", email: "charlie@test.com" }],
      });

      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith("[Gmail]/All Mail");
    });

    it("throws when message not found", async () => {
      mockFetch.mockReturnValue(asyncIter([]));

      await expect(
        driver.forward(encodeMessageRef("[Gmail]/All Mail", 999), {
          to: [{ name: "X", email: "x@test.com" }],
        })
      ).rejects.toThrow("Message not found");
    });
  });

  // ── getAttachment ───────────────────────────────────────
  describe("getAttachment", () => {
    it("resolves folder from qualified message ref", async () => {
      const qualifiedRef = encodeMessageRef("[Gmail]/Sent Mail", 55);

      // Mock a message with an attachment
      const fetchMsg = {
        uid: 55,
        source: Buffer.from(
          `From: test@gmail.com\r\nTo: bob@test.com\r\nSubject: With Attachment\r\nMessage-ID: <att-001@test.com>\r\nContent-Type: text/plain\r\n\r\nBody`
        ),
      };
      mockFetch.mockReturnValue(asyncIter([fetchMsg]));

      // mailparser mock returns no attachments by default, so this should throw
      await expect(
        driver.getAttachment(qualifiedRef, "some-checksum")
      ).rejects.toThrow("Attachment not found");

      // But it should have locked the correct folder
      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith("[Gmail]/Sent Mail");
    });

    it("throws on invalid message ref", async () => {
      await expect(
        driver.getAttachment("not-a-valid-ref", "att-id")
      ).rejects.toThrow("Invalid message reference");
    });
  });

  // ── getThread ───────────────────────────────────────────
  describe("getThread", () => {
    it("fetches from All Mail first", async () => {
      const msg = makeFetchMsg({ uid: 10, threadId: "thread-1" });
      mockSearch.mockResolvedValue([10]);
      mockFetch.mockReturnValue(asyncIter([msg]));

      const thread = await driver.getThread("thread-1");

      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith("[Gmail]/All Mail");
      expect(thread.id).toBe("thread-1");
      expect(thread.messages.length).toBe(1);
      expect(thread.subject).toBe("Test Subject");
    });

    it("falls back to INBOX when All Mail returns no UIDs", async () => {
      // getThread: All Mail search — no results
      // getThreadFromAllFolders: INBOX search — found, then Sent search (not reached)
      mockSearch
        .mockResolvedValueOnce([])   // All Mail — empty
        .mockResolvedValueOnce([5]); // INBOX fallback — found

      const msg = makeFetchMsg({ uid: 5, threadId: "thread-2" });
      // getThreadFromAllFolders: INBOX fetch
      mockFetch.mockReturnValueOnce(asyncIter([msg]));

      const thread = await driver.getThread("thread-2");

      expect(thread.id).toBe("thread-2");
      expect(thread.messages.length).toBe(1);
    });

    it("falls back when UIDs found but fetch returns 0 messages (H2 fix)", async () => {
      // All Mail search finds UIDs, but fetch returns nothing
      mockSearch.mockResolvedValueOnce([10, 11]);
      mockFetch.mockReturnValueOnce(asyncIter([])); // All Mail fetch — empty

      // Fallback to INBOX
      mockSearch.mockResolvedValueOnce([5]);
      const msg = makeFetchMsg({ uid: 5 });
      mockFetch.mockReturnValueOnce(asyncIter([msg]));

      const thread = await driver.getThread("thread-3");

      expect(thread.messages.length).toBe(1);
    });

    it("throws when no folders have the thread", async () => {
      // All Mail — no UIDs
      mockSearch.mockResolvedValue([]);
      mockFetch.mockReturnValue(asyncIter([]));

      await expect(driver.getThread("nonexistent")).rejects.toThrow("Thread not found");
    });

    it("encodes folder:uid in message IDs", async () => {
      // search returns UID 42, and the fetch also yields uid: 42
      mockSearch.mockResolvedValue([42]);
      const msg = makeFetchMsg({ uid: 42 });
      mockFetch.mockReturnValue(asyncIter([msg]));

      const thread = await driver.getThread("thread-x");

      // parsedMailToMessage encodes "[Gmail]/All Mail:42" since source folder is All Mail
      expect(thread.messages[0].id).toBe("[Gmail]/All Mail:42");
      expect(thread.messages[0]._sourceFolder).toBe("[Gmail]/All Mail");
    });
  });

  // ── reply ───────────────────────────────────────────────
  describe("reply", () => {
    it("fetches only envelopes (not full bodies) for reply metadata", async () => {
      const msg1 = makeFetchMsg({
        uid: 10,
        envelope: {
          from: [{ value: [{ name: "Alice", address: "alice@test.com" }] }],
          to: [{ value: [{ name: "Test", address: "test@gmail.com" }] }],
          cc: [],
          subject: "Original Subject",
          messageId: "<msg-010@test.com>",
        },
      });
      const msg2 = makeFetchMsg({
        uid: 11,
        envelope: {
          from: [{ value: [{ name: "Bob", address: "bob@test.com" }] }],
          to: [{ value: [{ name: "Test", address: "test@gmail.com" }] }],
          cc: [],
          subject: "Re: Original Subject",
          messageId: "<msg-011@test.com>",
        },
      });

      mockSearch.mockResolvedValue([10, 11]);
      mockFetch.mockReturnValue(asyncIter([msg1, msg2]));

      await driver.reply("thread-reply", {
        body: "<p>My reply</p>",
      });

      // Verify fetch requested envelope+headers, NOT source (bodies)
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toEqual([10, 11]); // UIDs
      expect(fetchCall[1]).toHaveProperty("envelope", true);
      expect(fetchCall[1]).toHaveProperty("headers", true);
      expect(fetchCall[1]).not.toHaveProperty("source"); // H4 fix — no body download

      // Verify send was called with correct threading headers
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const sentMail = mockSendMail.mock.calls[0][0];
      expect(sentMail.subject).toBe("Re: Original Subject");
      expect(sentMail.inReplyTo).toBe("<msg-011@test.com>");
      expect(sentMail.references).toBe("<msg-010@test.com> <msg-011@test.com>");
    });

    it("replies to sender (not self) in single reply mode", async () => {
      const msg = makeFetchMsg({
        uid: 10,
        envelope: {
          from: [{ value: [{ name: "Alice", address: "alice@test.com" }] }],
          to: [{ value: [{ name: "Test", address: "test@gmail.com" }] }],
          cc: [],
          subject: "Hello",
          messageId: "<msg-100@test.com>",
        },
      });

      mockSearch.mockResolvedValue([10]);
      mockFetch.mockReturnValue(asyncIter([msg]));

      await driver.reply("thread-single", {
        body: "<p>Reply</p>",
        replyAll: false,
      });

      const sentMail = mockSendMail.mock.calls[0][0];
      // Should reply to Alice, not to self
      expect(sentMail.to).toContain("alice@test.com");
      expect(sentMail.to).not.toContain("test@gmail.com");
    });

    it("excludes self from replyAll recipients", async () => {
      const msg = makeFetchMsg({
        uid: 10,
        envelope: {
          from: [{ value: [{ name: "Alice", address: "alice@test.com" }] }],
          to: [{ value: [{ name: "Test", address: "test@gmail.com" }] }, { value: [{ name: "Charlie", address: "charlie@test.com" }] }],
          cc: [{ value: [{ name: "Dave", address: "dave@test.com" }] }],
          subject: "Group Thread",
          messageId: "<msg-200@test.com>",
        },
      });

      mockSearch.mockResolvedValue([10]);
      mockFetch.mockReturnValue(asyncIter([msg]));

      await driver.reply("thread-group", {
        body: "<p>Reply all</p>",
        replyAll: true,
      });

      const sentMail = mockSendMail.mock.calls[0][0];
      expect(sentMail.to).toContain("alice@test.com");
      expect(sentMail.to).toContain("charlie@test.com");
      expect(sentMail.to).not.toContain("test@gmail.com"); // self excluded
    });

    it("throws when thread has no messages", async () => {
      mockSearch.mockResolvedValue([]);

      await expect(
        driver.reply("empty-thread", { body: "hi" })
      ).rejects.toThrow("Thread has no messages");
    });
  });

  // ── listThreads ─────────────────────────────────────────
  describe("listThreads", () => {
    it("deduplicates from addresses (H3 fix)", async () => {
      // Two messages from the same person in one thread
      const msg1 = makeFetchMsg({
        uid: 1,
        envelope: {
          from: [{ value: [{ name: "Alice", address: "alice@test.com" }] }],
          to: [{ value: [{ name: "Bob", address: "bob@test.com" }] }],
          subject: "Thread",
          date: new Date("2024-01-15T10:00:00Z"),
        },
      });
      const msg2 = makeFetchMsg({
        uid: 2,
        envelope: {
          from: [{ value: [{ name: "Alice", address: "alice@test.com" }] }],
          to: [{ value: [{ name: "Bob", address: "bob@test.com" }] }],
          subject: "Thread",
          date: new Date("2024-01-15T11:00:00Z"),
        },
      });
      // Both messages share a threadId
      (msg1 as Record<string, unknown>).threadId = "thread-dedup";
      (msg2 as Record<string, unknown>).threadId = "thread-dedup";

      // First fetch: sequence range to get UIDs
      mockFetch.mockReturnValueOnce(asyncIter([{ uid: 1 }, { uid: 2 }]));
      // Second fetch: envelope data
      mockFetch.mockReturnValueOnce(asyncIter([msg1, msg2]));

      const result = await driver.listThreads({ maxResults: 10 });

      expect(result.threads.length).toBe(1);
      // Should have deduplicated — only 1 "from" entry for alice, not 2
      expect(result.threads[0].from.length).toBe(1);
      expect(result.threads[0].from[0].email).toBe("alice@test.com");
    });

    it("keeps unique senders in from array", async () => {
      const msg1 = makeFetchMsg({
        uid: 1,
        envelope: {
          from: [{ value: [{ name: "Alice", address: "alice@test.com" }] }],
          to: [{ value: [{ name: "Bob", address: "bob@test.com" }] }],
          subject: "Thread",
          date: new Date("2024-01-15T10:00:00Z"),
        },
      });
      const msg2 = makeFetchMsg({
        uid: 2,
        envelope: {
          from: [{ value: [{ name: "Bob", address: "bob@test.com" }] }],
          to: [{ value: [{ name: "Alice", address: "alice@test.com" }] }],
          subject: "Thread",
          date: new Date("2024-01-15T11:00:00Z"),
        },
      });
      (msg1 as Record<string, unknown>).threadId = "thread-multi";
      (msg2 as Record<string, unknown>).threadId = "thread-multi";

      mockFetch.mockReturnValueOnce(asyncIter([{ uid: 1 }, { uid: 2 }]));
      mockFetch.mockReturnValueOnce(asyncIter([msg1, msg2]));

      const result = await driver.listThreads({ maxResults: 10 });

      expect(result.threads[0].from.length).toBe(2);
      expect(result.threads[0].from.map((f: EmailAddress) => f.email)).toEqual(["alice@test.com", "bob@test.com"]);
    });

    it("returns empty list when mailbox has 0 messages", async () => {
      mockImapClient.mailbox = { exists: 0 };

      const result = await driver.listThreads({});

      expect(result.threads).toEqual([]);
    });

    it("uses INBOX by default", async () => {
      mockImapClient.mailbox = { exists: 0 };
      await driver.listThreads({});
      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith("INBOX");
    });

    it("maps label IDs to Gmail IMAP folders", async () => {
      mockImapClient.mailbox = { exists: 0 };
      await driver.listThreads({ labelIds: ["SENT"] });
      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith("[Gmail]/Sent Mail");
    });
  });

  // ── modifyFlags / markAsRead / markAsUnread ─────────────
  describe("flags", () => {
    it("markAsRead adds \\Seen flag", async () => {
      mockSearch.mockResolvedValue([10]);

      await driver.markAsRead("thread-read");

      expect(mockMessageFlagsAdd).toHaveBeenCalledWith([10], ["\\Seen"], { uid: true });
    });

    it("markAsUnread removes \\Seen flag", async () => {
      mockSearch.mockResolvedValue([10]);

      await driver.markAsUnread("thread-unread");

      expect(mockMessageFlagsRemove).toHaveBeenCalledWith([10], ["\\Seen"], { uid: true });
    });

    it("modifyFlags tries All Mail first", async () => {
      mockSearch.mockResolvedValue([10]);

      await driver.markAsRead("thread-flags");

      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith("[Gmail]/All Mail");
    });
  });

  // ── toggleStar ──────────────────────────────────────────
  describe("toggleStar", () => {
    it("adds \\Flagged when currentlyStarred=false", async () => {
      mockSearch.mockResolvedValue([10]);

      await driver.toggleStar("thread-star", false);

      expect(mockMessageFlagsAdd).toHaveBeenCalledWith([10], ["\\Flagged"], { uid: true });
    });

    it("removes \\Flagged when currentlyStarred=true", async () => {
      mockSearch.mockResolvedValue([10]);

      await driver.toggleStar("thread-unstar", true);

      expect(mockMessageFlagsRemove).toHaveBeenCalledWith([10], ["\\Flagged"], { uid: true });
    });

    it("checks current flag state when currentlyStarred is undefined", async () => {
      mockSearch.mockResolvedValue([10]);
      // Mock fetch to return a message with \\Flagged
      const msg = { uid: 10, flags: new Set(["\\Seen", "\\Flagged"]) };
      mockFetch.mockReturnValue(asyncIter([msg]));

      await driver.toggleStar("thread-toggle");

      // Should remove since currently starred
      expect(mockMessageFlagsRemove).toHaveBeenCalledWith([10], ["\\Flagged"], { uid: true });
    });
  });

  // ── send ────────────────────────────────────────────────
  describe("send", () => {
    it("sends via SMTP with correct params", async () => {
      const result = await driver.send({
        to: [{ name: "Bob", email: "bob@test.com" }],
        subject: "Hello",
        body: "<p>World</p>",
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const opts = mockSendMail.mock.calls[0][0];
      expect(opts.to).toBe('"Bob" <bob@test.com>');
      expect(opts.subject).toBe("Hello");
      expect(opts.html).toBe("<p>World</p>");
      expect(result.from.email).toBe("test@gmail.com");
    });

    it("includes inReplyTo and references headers", async () => {
      await driver.send({
        to: [{ name: "Bob", email: "bob@test.com" }],
        subject: "Re: Hello",
        body: "<p>Reply</p>",
        inReplyTo: "<msg-001@test.com>",
        references: "<msg-001@test.com> <msg-002@test.com>",
      });

      const opts = mockSendMail.mock.calls[0][0];
      expect(opts.inReplyTo).toBe("<msg-001@test.com>");
      expect(opts.references).toBe("<msg-001@test.com> <msg-002@test.com>");
    });
  });

  // ── cleanup ─────────────────────────────────────────────
  describe("cleanup", () => {
    it("marks driver as destroyed so future connections are not pooled", async () => {
      // First, make a request to create a pooled connection
      mockSearch.mockResolvedValue([10]);
      mockFetch.mockReturnValue(asyncIter([makeFetchMsg({ uid: 10 })]));
      await driver.markAsRead("thread-x");

      // Now cleanup — should destroy the pooled connection
      await driver.cleanup();

      expect(mockLogout).toHaveBeenCalled();
    });
  });

  // ── listLabels ──────────────────────────────────────────
  describe("listLabels", () => {
    it("converts mailbox list to labels", async () => {
      mockList.mockResolvedValue([
        { path: "INBOX", name: "Inbox" },
        { path: "[Gmail]/Sent Mail", name: "Sent Mail" },
        { path: "Custom Label", name: "Custom Label" },
      ]);

      const labels = await driver.listLabels();

      expect(labels).toHaveLength(3);
      expect(labels[0]).toEqual({ id: "INBOX", name: "Inbox", type: "system" });
      expect(labels[1]).toEqual({ id: "[Gmail]/Sent Mail", name: "Sent Mail", type: "system" });
      expect(labels[2]).toEqual({ id: "Custom Label", name: "Custom Label", type: "user" });
    });
  });
});
