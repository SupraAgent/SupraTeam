import { describe, it, expect } from "vitest";
import {
  encodeMessageRef,
  decodeMessageRef,
  isValidMessageRef,
  DEFAULT_FOLDER,
} from "@/lib/email/message-ref";

describe("message-ref", () => {
  // ── encodeMessageRef ──────────────────────────────────────
  describe("encodeMessageRef", () => {
    it("encodes folder and uid with colon separator", () => {
      expect(encodeMessageRef("[Gmail]/All Mail", 42)).toBe("[Gmail]/All Mail:42");
    });

    it("encodes INBOX folder", () => {
      expect(encodeMessageRef("INBOX", 7)).toBe("INBOX:7");
    });

    it("encodes nested Gmail folders", () => {
      expect(encodeMessageRef("[Gmail]/Sent Mail", 100)).toBe("[Gmail]/Sent Mail:100");
    });

    it("handles uid 0", () => {
      expect(encodeMessageRef("INBOX", 0)).toBe("INBOX:0");
    });
  });

  // ── decodeMessageRef ──────────────────────────────────────
  describe("decodeMessageRef", () => {
    it("decodes qualified folder:uid ref", () => {
      const ref = decodeMessageRef("[Gmail]/All Mail:42");
      expect(ref.folder).toBe("[Gmail]/All Mail");
      expect(ref.uid).toBe(42);
    });

    it("decodes INBOX ref", () => {
      const ref = decodeMessageRef("INBOX:7");
      expect(ref.folder).toBe("INBOX");
      expect(ref.uid).toBe(7);
    });

    it("decodes [Gmail]/Sent Mail ref", () => {
      const ref = decodeMessageRef("[Gmail]/Sent Mail:100");
      expect(ref.folder).toBe("[Gmail]/Sent Mail");
      expect(ref.uid).toBe(100);
    });

    it("decodes legacy bare UID to default folder", () => {
      const ref = decodeMessageRef("42");
      expect(ref.folder).toBe(DEFAULT_FOLDER);
      expect(ref.uid).toBe(42);
    });

    it("throws on non-numeric bare string", () => {
      expect(() => decodeMessageRef("not-a-uid")).toThrow("Invalid message reference");
    });

    it("throws on empty string", () => {
      expect(() => decodeMessageRef("")).toThrow("Invalid message reference");
    });

    it("handles large UIDs", () => {
      const ref = decodeMessageRef("[Gmail]/All Mail:999999");
      expect(ref.uid).toBe(999999);
    });

    it("uses lastIndexOf for folder paths containing colons", () => {
      // Edge case: if a folder path ever had a colon (unlikely but test the logic)
      const ref = decodeMessageRef("Custom:Folder:42");
      expect(ref.folder).toBe("Custom:Folder");
      expect(ref.uid).toBe(42);
    });
  });

  // ── roundtrip ─────────────────────────────────────────────
  describe("encode → decode roundtrip", () => {
    const cases = [
      { folder: "[Gmail]/All Mail", uid: 1 },
      { folder: "INBOX", uid: 42 },
      { folder: "[Gmail]/Sent Mail", uid: 999 },
      { folder: "[Gmail]/Trash", uid: 0 },
      { folder: "[Gmail]/Drafts", uid: 12345 },
    ];

    for (const { folder, uid } of cases) {
      it(`roundtrips ${folder}:${uid}`, () => {
        const encoded = encodeMessageRef(folder, uid);
        const decoded = decodeMessageRef(encoded);
        expect(decoded.folder).toBe(folder);
        expect(decoded.uid).toBe(uid);
      });
    }
  });

  // ── isValidMessageRef ─────────────────────────────────────
  describe("isValidMessageRef", () => {
    it("returns true for qualified ref", () => {
      expect(isValidMessageRef("[Gmail]/All Mail:42")).toBe(true);
    });

    it("returns true for bare UID", () => {
      expect(isValidMessageRef("42")).toBe(true);
    });

    it("returns false for invalid string", () => {
      expect(isValidMessageRef("not-valid")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidMessageRef("")).toBe(false);
    });
  });
});
