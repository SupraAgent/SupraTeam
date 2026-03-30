import { ImapFlow, type FetchMessageObject } from "imapflow";
import * as nodemailer from "nodemailer";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import type { Readable } from "stream";
import type {
  MailDriver,
  Thread,
  ThreadList,
  ThreadListItem,
  Message,
  Label,
  EmailProfile,
  Attachment,
  SendParams,
  ReplyParams,
  ForwardParams,
  DraftParams,
  Draft,
  ListThreadsParams,
  EmailAddress,
  AttachmentMeta,
} from "./types";

interface ImapDriverConfig {
  email: string;
  appPassword: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}

const GMAIL_IMAP = { host: "imap.gmail.com", port: 993 };
const GMAIL_SMTP = { host: "smtp.gmail.com", port: 465 };

// ── Connection pool ──────────────────────────────────────
const imapPool = new Map<string, { client: ImapFlow; timer: ReturnType<typeof setTimeout>; createdAt: number }>();
const IMAP_POOL_TTL = 30_000;
const IMAP_POOL_MAX = 20;

function evictOldestPoolEntry(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of imapPool) {
    if (entry.createdAt < oldestTime) {
      oldestTime = entry.createdAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    const entry = imapPool.get(oldestKey);
    if (entry) {
      clearTimeout(entry.timer);
      entry.client.logout().catch(() => {});
      imapPool.delete(oldestKey);
    }
  }
}

function returnToPool(key: string, client: ImapFlow): void {
  // If pool is at capacity, evict oldest before adding
  if (imapPool.size >= IMAP_POOL_MAX && !imapPool.has(key)) {
    evictOldestPoolEntry();
  }
  const timer = setTimeout(() => {
    const entry = imapPool.get(key);
    if (entry) {
      entry.client.logout().catch(() => {});
      imapPool.delete(key);
    }
  }, IMAP_POOL_TTL);
  // Unref so the timer doesn't keep the process alive
  if (typeof timer === "object" && "unref" in timer) {
    (timer as NodeJS.Timeout).unref();
  }
  imapPool.set(key, { client, timer, createdAt: Date.now() });
}

function destroyPoolEntry(key: string): void {
  const entry = imapPool.get(key);
  if (entry) {
    clearTimeout(entry.timer);
    entry.client.logout().catch(() => {});
    try { entry.client.close(); } catch { /* already closed */ }
    imapPool.delete(key);
  }
}

// Gmail IMAP label → folder mapping
const LABEL_TO_FOLDER: Record<string, string> = {
  INBOX: "INBOX",
  SENT: "[Gmail]/Sent Mail",
  TRASH: "[Gmail]/Trash",
  SPAM: "[Gmail]/Spam",
  DRAFT: "[Gmail]/Drafts",
  STARRED: "[Gmail]/Starred",
  IMPORTANT: "[Gmail]/Important",
};

export class ImapDriver implements MailDriver {
  private config: ImapDriverConfig;
  public connectionId: string | null = null;
  public userId: string | null = null;

  constructor(config: ImapDriverConfig) {
    this.config = config;
  }

  private createImapClient(): ImapFlow {
    return new ImapFlow({
      host: this.config.imapHost ?? GMAIL_IMAP.host,
      port: this.config.imapPort ?? GMAIL_IMAP.port,
      secure: true,
      auth: {
        user: this.config.email,
        pass: this.config.appPassword,
      },
      logger: false,
      socketTimeout: 30_000,
    });
  }

  private createSmtpTransport(): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: this.config.smtpHost ?? GMAIL_SMTP.host,
      port: this.config.smtpPort ?? GMAIL_SMTP.port,
      secure: true,
      auth: {
        user: this.config.email,
        pass: this.config.appPassword,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }

  /** Run a callback with a pooled IMAP connection */
  private async withImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    // Key by userId:email to prevent cross-user connection reuse
    const poolKey = `${this.userId ?? "anon"}:${this.config.email}`;
    const pooled = imapPool.get(poolKey);
    let client: ImapFlow;
    let fromPool = false;

    if (pooled && pooled.client.usable) {
      // Reuse pooled connection
      clearTimeout(pooled.timer);
      imapPool.delete(poolKey);
      client = pooled.client;
      fromPool = true;
    } else {
      // Clean up stale entry if present
      if (pooled) {
        destroyPoolEntry(poolKey);
      }
      client = this.createImapClient();
      await client.connect();
    }

    try {
      const result = await fn(client);
      // Return to pool on success if still usable
      if (client.usable) {
        returnToPool(poolKey, client);
      } else {
        client.logout().catch(() => {});
      }
      return result;
    } catch (err) {
      // On error, destroy — don't return to pool
      // Always clean up the client directly (pool entry may already be gone)
      destroyPoolEntry(poolKey);
      client.logout().catch(() => {});
      try { client.close(); } catch { /* already closed */ }
      throw err;
    }
  }

  async listThreads(params: ListThreadsParams): Promise<ThreadList> {
    return this.withImap(async (client) => {
      // Determine which mailbox to open
      const folder = params.labelIds?.[0]
        ? LABEL_TO_FOLDER[params.labelIds[0]] ?? params.labelIds[0]
        : "INBOX";

      const lock = await client.getMailboxLock(folder);
      try {
        const maxResults = params.maxResults ?? 25;

        // Use Gmail search if query provided, otherwise fetch recent
        let uids: number[];
        if (params.query) {
          // Standard IMAP search across subject, from, and to fields
          const query = params.query;
          uids = await client.search({
            or: [
              { subject: query },
              { from: query },
              { to: query },
            ],
          })
            .then((r) => (r as number[]).slice(-maxResults * 2).reverse())
            .catch(() => []);
        } else {
          // Fetch the most recent messages by sequence number
          const mailbox = client.mailbox;
          const total = mailbox && typeof mailbox === "object" && "exists" in mailbox
            ? (mailbox as { exists: number }).exists
            : 0;
          if (total === 0) return { threads: [] };
          const start = Math.max(1, total - maxResults * 2 + 1);
          uids = await client.search({ seq: `${start}:*` } as Record<string, unknown>)
            .then((r) => (r as number[]).reverse())
            .catch(() => []);
        }

        if (uids.length === 0) return { threads: [] };

        // Fetch message envelopes with Gmail thread IDs
        const threadMap = new Map<string, { messages: Array<{ uid: number; envelope: Record<string, unknown>; flags: Set<string>; gmThrid: string; date: Date }>; snippet: string }>();
        const fetchOpts = {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          headers: true,
          // Request Gmail thread ID extension
          threadId: true,
        };

        for await (const msg of client.fetch(uids.slice(0, maxResults * 2), fetchOpts, { uid: true })) {
          const msgAny = msg as unknown as Record<string, unknown>;
          const gmThrid = String(msgAny.threadId ?? msg.uid);
          const envelope = msg.envelope as Record<string, unknown>;
          const flags = (msg.flags ?? new Set<string>()) as Set<string>;

          if (!threadMap.has(gmThrid)) {
            threadMap.set(gmThrid, { messages: [], snippet: "" });
          }
          threadMap.get(gmThrid)!.messages.push({
            uid: msg.uid,
            envelope,
            flags,
            gmThrid,
            date: (envelope.date as Date) ?? new Date(),
          });
        }

        // Convert to ThreadListItem, sorted by last message date desc
        const threads: ThreadListItem[] = [];
        for (const [threadId, { messages }] of threadMap) {
          messages.sort((a, b) => a.date.getTime() - b.date.getTime());
          const first = messages[0];
          const last = messages[messages.length - 1];
          const firstEnv = first.envelope;
          const lastEnv = last.envelope;

          const allFlags = new Set<string>();
          let hasUnread = false;
          for (const m of messages) {
            for (const f of m.flags) allFlags.add(f);
            if (!m.flags.has("\\Seen")) hasUnread = true;
          }

          threads.push({
            id: threadId,
            subject: String(firstEnv.subject ?? "(no subject)"),
            snippet: "",
            from: messages.map((m) => this.parseImapAddress(m.envelope.from as AddressObject[])),
            to: [this.parseImapAddress(firstEnv.to as AddressObject[])],
            labelIds: folder === "INBOX" ? ["INBOX"] : [],
            isUnread: hasUnread,
            isStarred: allFlags.has("\\Flagged"),
            lastMessageAt: last.date.toISOString(),
            messageCount: messages.length,
          });
        }

        // Sort by last message, limit
        threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

        return {
          threads: threads.slice(0, maxResults),
        };
      } finally {
        lock.release();
      }
    });
  }

  async getThread(threadId: string): Promise<Thread> {
    return this.withImap(async (client) => {
      // Search [Gmail]/All Mail first — it contains ALL messages regardless of label
      let uids: number[] = [];
      const lock = await client.getMailboxLock("[Gmail]/All Mail");
      try {
        try {
          uids = await client.search({ threadId } as Record<string, unknown>)
            .then((r) => r as number[]);
        } catch {
          // Fallback: treat threadId as UID
          uids = [parseInt(threadId, 10)];
        }
      } finally {
        lock.release();
      }

      if (uids.length === 0) {
        // Try INBOX and Sent Mail as fallback
        return this.getThreadFromAllFolders(client, threadId);
      }

      // Fetch full messages from All Mail
      const messages: Message[] = [];
      const fetchLock = await client.getMailboxLock("[Gmail]/All Mail");
      try {
        for await (const msg of client.fetch(uids, {
          uid: true,
          envelope: true,
          flags: true,
          source: true,
          threadId: true,
        }, { uid: true })) {
          const parsed = await this.parseSource(msg.source);
          const flags = (msg.flags ?? new Set<string>()) as Set<string>;
          messages.push(this.parsedMailToMessage(parsed, String(msg.uid), threadId, flags));
        }
      } finally {
        fetchLock.release();
      }

      messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (messages.length === 0) {
        throw new Error("Thread not found");
      }

      let isUnread = false;
      let isStarred = false;
      for (const m of messages) {
        if (m.isUnread) isUnread = true;
        if (!isStarred) {
          // Check raw flags from the parsed message — isUnread uses \\Seen,
          // but we need to check \\Flagged which isn't exposed on Message type.
          // For now, leave isStarred from the thread-level detection.
        }
      }

      return {
        id: threadId,
        subject: messages[0].subject,
        snippet: messages[messages.length - 1].bodyText.slice(0, 200),
        from: messages.map((m) => m.from),
        to: messages[0].to,
        messages,
        labelIds: [],
        isUnread,
        isStarred,
        lastMessageAt: messages[messages.length - 1].date,
        messageCount: messages.length,
      };
    });
  }

  private async getThreadFromAllFolders(client: ImapFlow, threadId: string): Promise<Thread> {
    // Search INBOX and Sent Mail (All Mail already searched by getThread caller)
    for (const folder of ["INBOX", "[Gmail]/Sent Mail"]) {
      try {
        const lock = await client.getMailboxLock(folder);
        try {
          const uids = await client.search({ threadId } as Record<string, unknown>)
            .then((r) => r as number[])
            .catch(() => [] as number[]);

          if (uids.length === 0) continue;

          const messages: Message[] = [];
          for await (const msg of client.fetch(uids, {
            uid: true,
            envelope: true,
            flags: true,
            source: true,
            threadId: true,
          }, { uid: true })) {
            const parsed = await this.parseSource(msg.source);
            messages.push(this.parsedMailToMessage(parsed, String(msg.uid), threadId, (msg.flags ?? new Set<string>()) as Set<string>));
          }

          if (messages.length === 0) continue;

          messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          return {
            id: threadId,
            subject: messages[0].subject,
            snippet: messages[messages.length - 1].bodyText.slice(0, 200),
            from: messages.map((m) => m.from),
            to: messages[0].to,
            messages,
            labelIds: [],
            isUnread: messages.some((m) => m.isUnread),
            isStarred: false,
            lastMessageAt: messages[messages.length - 1].date,
            messageCount: messages.length,
          };
        } finally {
          lock.release();
        }
      } catch {
        continue;
      }
    }
    throw new Error("Thread not found");
  }

  async markAsRead(threadId: string): Promise<void> {
    await this.modifyFlags(threadId, "\\Seen", true);
  }

  async markAsUnread(threadId: string): Promise<void> {
    await this.modifyFlags(threadId, "\\Seen", false);
  }

  async archive(threadId: string): Promise<void> {
    await this.withImap(async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await this.findThreadUids(client, threadId);
        if (uids.length > 0) {
          // Move to All Mail (removes from INBOX)
          await client.messageMove(uids, "[Gmail]/All Mail", { uid: true });
        }
      } finally {
        lock.release();
      }
    });
  }

  async trash(threadId: string): Promise<void> {
    await this.withImap(async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await this.findThreadUids(client, threadId);
        if (uids.length > 0) {
          await client.messageMove(uids, "[Gmail]/Trash", { uid: true });
        }
      } finally {
        lock.release();
      }
    });
  }

  async toggleStar(threadId: string, currentlyStarred?: boolean): Promise<void> {
    const shouldStar = currentlyStarred !== undefined ? !currentlyStarred : undefined;
    if (shouldStar === undefined) {
      // Need to check current state
      await this.withImap(async (client) => {
        const lock = await client.getMailboxLock("INBOX");
        try {
          const uids = await this.findThreadUids(client, threadId);
          if (uids.length === 0) return;
          // Check first message's flags
          for await (const msg of client.fetch([uids[0]], { flags: true }, { uid: true })) {
            const flags = (msg.flags ?? new Set<string>()) as Set<string>;
            const isStarred = flags.has("\\Flagged");
            if (isStarred) {
              await client.messageFlagsRemove(uids, ["\\Flagged"], { uid: true });
            } else {
              await client.messageFlagsAdd(uids, ["\\Flagged"], { uid: true });
            }
          }
        } finally {
          lock.release();
        }
      });
    } else {
      await this.modifyFlags(threadId, "\\Flagged", shouldStar);
    }
  }

  async modifyLabels(_threadId: string, _add: string[], _remove: string[]): Promise<void> {
    throw new Error("Label modification is not yet supported for personal Gmail connections. Use the Gmail web interface to manage labels.");
  }

  async send(params: SendParams): Promise<Message> {
    const transport = this.createSmtpTransport();
    const formatAddr = (a: EmailAddress) =>
      a.name ? `"${a.name}" <${a.email}>` : a.email;

    const mailOptions: nodemailer.SendMailOptions = {
      from: params.from ? formatAddr(params.from) : this.config.email,
      to: params.to.map(formatAddr).join(", "),
      cc: params.cc?.map(formatAddr).join(", "),
      bcc: params.bcc?.map(formatAddr).join(", "),
      subject: params.subject,
      html: params.body,
      text: params.bodyText || params.body.replace(/<[^>]+>/g, ""),
      inReplyTo: params.inReplyTo,
      references: params.references,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.data, "base64"),
        contentType: a.mimeType,
      })),
    };

    const info = await transport.sendMail(mailOptions);

    return {
      id: info.messageId ?? crypto.randomUUID(),
      threadId: info.messageId ?? "",
      from: { name: "", email: this.config.email },
      to: params.to,
      cc: params.cc ?? [],
      bcc: params.bcc ?? [],
      subject: params.subject,
      body: params.body,
      bodyText: params.bodyText ?? params.body.replace(/<[^>]+>/g, ""),
      date: new Date().toISOString(),
      attachments: [],
      isUnread: false,
    };
  }

  async reply(threadId: string, params: ReplyParams): Promise<Message> {
    const thread = await this.getThread(threadId);
    const messages = thread.messages;
    if (messages.length === 0) throw new Error("Thread has no messages");

    const lastMsg = messages[messages.length - 1];

    // Build reply recipients
    const to = params.replyAll
      ? [lastMsg.from, ...lastMsg.to, ...lastMsg.cc].filter(
          (a, i, arr) =>
            a.email.toLowerCase() !== this.config.email.toLowerCase() &&
            arr.findIndex((b) => b.email.toLowerCase() === a.email.toLowerCase()) === i
        )
      : [lastMsg.from];

    const subject = lastMsg.subject.startsWith("Re:")
      ? lastMsg.subject
      : `Re: ${lastMsg.subject}`;

    return this.send({
      to,
      cc: params.cc,
      bcc: params.bcc,
      subject,
      body: params.body,
      bodyText: params.bodyText,
      attachments: params.attachments,
      inReplyTo: lastMsg.id,
      references: lastMsg.id,
    });
  }

  async forward(messageId: string, params: ForwardParams): Promise<Message> {
    // Fetch the specific message by UID, not the whole thread
    const original = await this.withImap(async (client) => {
      const lock = await client.getMailboxLock("[Gmail]/All Mail");
      try {
        for await (const msg of client.fetch([parseInt(messageId, 10)], {
          uid: true,
          envelope: true,
          flags: true,
          source: true,
        }, { uid: true })) {
          const parsed = await this.parseSource(msg.source);
          return this.parsedMailToMessage(parsed, String(msg.uid), "", (msg.flags ?? new Set<string>()) as Set<string>);
        }
        throw new Error("Message not found");
      } finally {
        lock.release();
      }
    });

    const { sanitizeTemplateHtml } = await import("./sanitize");
    const sanitizedBody = sanitizeTemplateHtml(original.body);

    const forwardBody = params.body
      ? `${params.body}<br><br>---------- Forwarded message ----------<br>${sanitizedBody}`
      : `---------- Forwarded message ----------<br>From: ${original.from.email}<br>Date: ${original.date}<br>Subject: ${original.subject}<br><br>${sanitizedBody}`;

    return this.send({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: `Fwd: ${original.subject}`,
      body: forwardBody,
      attachments: params.attachments,
    });
  }

  async createDraft(params: DraftParams): Promise<Draft> {
    const formatAddr = (a: EmailAddress) =>
      a.name ? `"${a.name}" <${a.email}>` : a.email;

    // Build raw RFC822 message using nodemailer's MailComposer (does NOT send)
    const MailComposer = (await import("nodemailer/lib/mail-composer")).default;
    const composer = new MailComposer({
      from: this.config.email,
      to: params.to.map(formatAddr).join(", "),
      cc: params.cc?.map(formatAddr).join(", "),
      subject: params.subject,
      html: params.body,
      text: params.bodyText || params.body.replace(/<[^>]+>/g, ""),
    });
    const rawMessage = await composer.compile().build();

    // Append to [Gmail]/Drafts via IMAP
    const draftId = await this.withImap(async (client) => {
      const result = await client.append("[Gmail]/Drafts", rawMessage, ["\\Draft", "\\Seen"]);
      if (result && typeof result === "object" && "uid" in result) {
        return String((result as { uid: number }).uid);
      }
      return crypto.randomUUID();
    });

    const message: Message = {
      id: draftId,
      threadId: draftId,
      from: { name: "", email: this.config.email },
      to: params.to,
      cc: params.cc ?? [],
      bcc: params.bcc ?? [],
      subject: params.subject,
      body: params.body,
      bodyText: params.bodyText ?? params.body.replace(/<[^>]+>/g, ""),
      date: new Date().toISOString(),
      attachments: [],
      isUnread: false,
    };

    return { id: draftId, message };
  }

  async search(query: string, maxResults = 25): Promise<ThreadList> {
    return this.listThreads({ query, maxResults });
  }

  async listLabels(): Promise<Label[]> {
    return this.withImap(async (client) => {
      const mailboxes = await client.list();
      const labels: Label[] = [];

      for (const mb of mailboxes) {
        const isSystem = mb.path.startsWith("[Gmail]") || mb.path === "INBOX";
        labels.push({
          id: mb.path,
          name: mb.name,
          type: isSystem ? "system" : "user",
        });
      }

      return labels;
    });
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Attachment> {
    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock("[Gmail]/All Mail");
      try {
        const uid = parseInt(messageId, 10);
        for await (const msg of client.fetch([uid], { source: true }, { uid: true })) {
          const parsed = await this.parseSource(msg.source);
          const att = parsed.attachments?.find(
            (a) => a.checksum === attachmentId || a.filename === attachmentId
          );
          if (att) {
            return {
              data: att.content,
              filename: att.filename ?? "attachment",
              mimeType: att.contentType ?? "application/octet-stream",
              size: att.size,
            };
          }
        }
        throw new Error("Attachment not found");
      } finally {
        lock.release();
      }
    });
  }

  async getProfile(): Promise<EmailProfile> {
    // Try to get real display name from Sent Mail
    try {
      return await this.withImap(async (client) => {
        const lock = await client.getMailboxLock("[Gmail]/Sent Mail");
        try {
          const uids = await client.search({ from: this.config.email })
            .then((r) => (r as number[]).slice(-1))
            .catch(() => [] as number[]);
          if (uids.length > 0) {
            for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
              const from = (msg.envelope as Record<string, unknown>)?.from as AddressObject[] | undefined;
              const val = from?.[0]?.value?.[0];
              if (val?.name) {
                return { email: this.config.email, name: val.name };
              }
            }
          }
        } finally {
          lock.release();
        }
        // Fallback: derive from email
        const name = this.config.email.split("@")[0]?.replace(/[._]/g, " ") ?? this.config.email;
        return { email: this.config.email, name };
      });
    } catch {
      // If IMAP fails, use email-derived name
      const name = this.config.email.split("@")[0]?.replace(/[._]/g, " ") ?? this.config.email;
      return { email: this.config.email, name };
    }
  }

  /** Parse IMAP message source into ParsedMail, handling type overloads */
  private async parseSource(source: Buffer | Readable | undefined): Promise<ParsedMail> {
    if (!source) throw new Error("Message source not available");
    return await simpleParser(source) as ParsedMail;
  }

  // ── Private helpers ─────────────────────────────────────

  private parseImapAddress(addresses: AddressObject[] | undefined): EmailAddress {
    if (!addresses || addresses.length === 0) return { name: "", email: "" };
    const first = addresses[0];
    const val = first.value?.[0];
    if (!val) return { name: "", email: "" };
    return { name: val.name ?? "", email: val.address ?? "" };
  }

  private parsedMailToMessage(
    parsed: ParsedMail,
    uid: string,
    threadId: string,
    flags: Set<string>
  ): Message {
    const getAddresses = (field: AddressObject | AddressObject[] | undefined): EmailAddress[] => {
      if (!field) return [];
      const arr = Array.isArray(field) ? field : [field];
      return arr.flatMap((a) =>
        (a.value ?? []).map((v) => ({ name: v.name ?? "", email: v.address ?? "" }))
      );
    };

    const from = getAddresses(parsed.from)?.[0] ?? { name: "", email: "" };
    const attachments: AttachmentMeta[] = (parsed.attachments ?? []).map((a) => ({
      id: a.checksum ?? a.filename ?? crypto.randomUUID(),
      filename: a.filename ?? "attachment",
      mimeType: a.contentType ?? "application/octet-stream",
      size: a.size,
    }));

    return {
      id: uid,
      threadId,
      from,
      to: getAddresses(parsed.to),
      cc: getAddresses(parsed.cc),
      bcc: getAddresses(parsed.bcc),
      subject: parsed.subject ?? "(no subject)",
      body: parsed.html || parsed.textAsHtml || parsed.text || "",
      bodyText: parsed.text ?? "",
      date: parsed.date?.toISOString() ?? new Date().toISOString(),
      attachments,
      isUnread: !flags.has("\\Seen"),
    };
  }

  private async findThreadUids(client: ImapFlow, threadId: string): Promise<number[]> {
    try {
      return await client.search({ threadId } as Record<string, unknown>)
        .then((r) => r as number[]);
    } catch {
      const uid = parseInt(threadId, 10);
      return isNaN(uid) ? [] : [uid];
    }
  }

  private async modifyFlags(threadId: string, flag: string, add: boolean): Promise<void> {
    await this.withImap(async (client) => {
      // Try [Gmail]/All Mail first (contains all messages regardless of folder),
      // fall back to INBOX if that fails.
      let folder = "[Gmail]/All Mail";
      let lock;
      try {
        lock = await client.getMailboxLock(folder);
      } catch {
        folder = "INBOX";
        lock = await client.getMailboxLock(folder);
      }
      try {
        const uids = await this.findThreadUids(client, threadId);
        if (uids.length === 0) return;
        if (add) {
          await client.messageFlagsAdd(uids, [flag], { uid: true });
        } else {
          await client.messageFlagsRemove(uids, [flag], { uid: true });
        }
      } finally {
        lock.release();
      }
    });
  }
}
