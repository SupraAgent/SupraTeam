// ── MessageRef: folder-scoped IMAP message references ──────
//
// IMAP UIDs are only unique within a single mailbox (folder).
// UID 42 in INBOX is a completely different message than UID 42 in [Gmail]/All Mail.
//
// This module provides a typed abstraction over the "folder:uid" encoding
// used to safely pass IMAP message references through the MailDriver interface
// (which uses plain string IDs for API transport compatibility).

export interface MessageRef {
  /** IMAP mailbox path, e.g. "[Gmail]/All Mail", "INBOX" */
  folder: string;
  /** IMAP UID within that folder */
  uid: number;
}

/** Default folder when no folder is encoded in the ref (legacy bare UIDs). */
export const DEFAULT_FOLDER = "[Gmail]/All Mail";

/** Separator between folder path and UID in encoded refs. */
const SEP = ":";

/**
 * Encode a folder + UID into a portable string ID.
 *
 * Examples:
 *   encodeMessageRef("[Gmail]/All Mail", 42)  → "[Gmail]/All Mail:42"
 *   encodeMessageRef("INBOX", 7)              → "INBOX:7"
 */
export function encodeMessageRef(folder: string, uid: number): string {
  return `${folder}${SEP}${uid}`;
}

/**
 * Decode a message ref string back to { folder, uid }.
 *
 * Handles both qualified refs ("folder:uid") and legacy bare UIDs ("42").
 * Legacy bare UIDs default to [Gmail]/All Mail since that's where
 * getThread() primarily fetches from.
 *
 * @throws if the UID portion is not a valid number
 */
export function decodeMessageRef(ref: string): MessageRef {
  const colonIdx = ref.lastIndexOf(SEP);

  if (colonIdx > 0) {
    const folder = ref.slice(0, colonIdx);
    const uid = parseInt(ref.slice(colonIdx + 1), 10);
    if (!isNaN(uid) && folder.length > 0) {
      return { folder, uid };
    }
  }

  // Legacy: bare UID string
  const uid = parseInt(ref, 10);
  if (isNaN(uid)) {
    throw new Error(`Invalid message reference: ${ref}`);
  }
  return { folder: DEFAULT_FOLDER, uid };
}

/**
 * Check if a string looks like a valid message ref (qualified or bare UID).
 */
export function isValidMessageRef(ref: string): boolean {
  try {
    decodeMessageRef(ref);
    return true;
  } catch {
    return false;
  }
}
