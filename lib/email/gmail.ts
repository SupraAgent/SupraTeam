import { google, type gmail_v1 } from "googleapis";
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

/** Escape HTML special characters to prevent XSS in interpolated values */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Retry Gmail API calls on 429/5xx with exponential backoff (Google requirement) */
async function withBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      const isRetryable = code === 429 || (code !== undefined && code >= 500);
      if (!isRetryable || attempt === maxRetries) throw err;
      const delayMs = Math.min(1000 * 2 ** attempt + Math.random() * 500, 16000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("withBackoff: unreachable");
}

type GmailConfig = {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  expiryDate?: number;
};

export class GmailDriver implements MailDriver {
  private gmail: gmail_v1.Gmail;
  private auth: InstanceType<typeof google.auth.OAuth2>;

  public connectionId: string | null = null;
  public userId: string | null = null;

  constructor(config: GmailConfig) {
    this.auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
    this.auth.setCredentials({
      access_token: config.accessToken,
      refresh_token: config.refreshToken,
      expiry_date: config.expiryDate ?? undefined,
    });
    // HTTP/2: multiplex all concurrent Gmail API calls over a single TCP connection
    // On Railway's persistent process, the connection stays warm between requests
    this.gmail = google.gmail({ version: "v1", auth: this.auth, http2: true });

    // Persist refreshed tokens back to database and invalidate cache.
    // Google may rotate the refresh_token — we MUST persist it or the connection dies.
    // Retry up to 3 times with backoff — a failed persist means the next request
    // uses stale tokens from DB, triggering another refresh (infinite loop on DB outage).
    this.auth.on("tokens", async (tokens) => {
      if (tokens.access_token && this.connectionId) {
        if (!this.userId) {
          console.error("[gmail] Cannot persist refreshed token — userId not set on driver");
          return;
        }
        const connId = this.connectionId;
        const uid = this.userId;
        const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;
        const refreshToken = tokens.refresh_token ?? undefined;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const { updateConnectionTokens } = await import("./driver");
            const { serverCache } = await import("./server-cache");
            await updateConnectionTokens(connId, uid, tokens.access_token, expiryDate, refreshToken);
            serverCache.invalidatePrefix(`driver:${uid}:`);
            return; // Success
          } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            console.error(`[gmail] Token persist attempt ${attempt + 1}/3 failed:`, msg);
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            }
          }
        }
        console.error("[gmail] All 3 token persist attempts failed for connection", connId);
      }
    });
  }

  /** Get refreshed access token (auto-refreshes if expired) */
  async getAccessToken(): Promise<string> {
    const { token } = await this.auth.getAccessToken();
    if (!token) throw new Error("Failed to refresh access token — reconnect Gmail in Settings");
    return token;
  }

  async listThreads(params: ListThreadsParams): Promise<ThreadList> {
    const res = await withBackoff(() => this.gmail.users.threads.list({
      userId: "me",
      labelIds: params.labelIds,
      q: params.query,
      maxResults: params.maxResults ?? 25,
      pageToken: params.pageToken,
    }));

    // Fetch threads in batches of 10 to avoid hitting Gmail rate limits
    // HTTP/2 multiplexes these over a single TCP connection on Railway
    const rawThreads = (res.data.threads ?? []).filter((t) => t.id);
    const BATCH_SIZE = 10;
    const fetchThread = (id: string) =>
      withBackoff(() => this.gmail.users.threads.get({
        userId: "me",
        id,
        format: "METADATA",
        metadataHeaders: ["Subject", "From", "To", "Date"],
        fields: "id,snippet,messages(id,labelIds,internalDate,payload/headers)",
      }));
    const threadData: Awaited<ReturnType<typeof fetchThread>>[] = [];
    for (let i = 0; i < rawThreads.length; i += BATCH_SIZE) {
      const batch = await Promise.all(
        rawThreads.slice(i, i + BATCH_SIZE).map((t) => fetchThread(t.id!))
      );
      threadData.push(...batch);
    }
    const threads: ThreadListItem[] = threadData.map((full) =>
      this.parseThreadListItem(full.data)
    );

    return {
      threads,
      nextPageToken: res.data.nextPageToken ?? undefined,
      resultSizeEstimate: res.data.resultSizeEstimate ?? undefined,
    };
  }

  async getThread(threadId: string): Promise<Thread> {
    const res = await withBackoff(() => this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "FULL",
    }));
    return this.parseThread(res.data);
  }

  async markAsRead(threadId: string): Promise<void> {
    await this.gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
  }

  async markAsUnread(threadId: string): Promise<void> {
    await this.gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: { addLabelIds: ["UNREAD"] },
    });
  }

  async archive(threadId: string): Promise<void> {
    await this.gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
  }

  async trash(threadId: string): Promise<void> {
    await this.gmail.users.threads.trash({ userId: "me", id: threadId });
  }

  async toggleStar(threadId: string, currentlyStarred?: boolean): Promise<void> {
    if (currentlyStarred !== undefined) {
      // Fast path: client tells us current state
      // Use messages.list (lightweight) instead of threads.get to get the first message ID
      const threadData = await this.gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "minimal",
        fields: "messages(id)",
      });
      const firstMsgId = threadData.data.messages?.[0]?.id;
      if (!firstMsgId) return;

      await this.gmail.users.messages.modify({
        userId: "me",
        id: firstMsgId,
        requestBody: currentlyStarred
          ? { removeLabelIds: ["STARRED"] }
          : { addLabelIds: ["STARRED"] },
      });
    } else {
      // Fallback: fetch state then toggle
      const thread = await this.gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "MINIMAL",
      });
      const firstMsg = thread.data.messages?.[0];
      if (!firstMsg?.id) return;
      const isStarred = firstMsg.labelIds?.includes("STARRED") ?? false;

      await this.gmail.users.messages.modify({
        userId: "me",
        id: firstMsg.id,
        requestBody: isStarred
          ? { removeLabelIds: ["STARRED"] }
          : { addLabelIds: ["STARRED"] },
      });
    }
  }

  async modifyLabels(threadId: string, add: string[], remove: string[]): Promise<void> {
    await this.gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: { addLabelIds: add, removeLabelIds: remove },
    });
  }

  async send(params: SendParams): Promise<Message> {
    const raw = this.buildRawEmail(params);
    const res = await withBackoff(() => this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    }));
    if (!res.data.id) throw new Error("Gmail did not return a message ID after send");
    const msg = await withBackoff(() => this.gmail.users.messages.get({
      userId: "me",
      id: res.data.id!,
      format: "FULL",
    }));
    return this.parseMessage(msg.data);
  }

  async reply(threadId: string, params: ReplyParams): Promise<Message> {
    // Fetch only headers (METADATA), not full bodies
    const threadRes = await this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "METADATA",
      metadataHeaders: ["Subject", "From", "To", "Cc", "Message-ID", "References"],
    });
    const messages = threadRes.data.messages ?? [];
    if (messages.length === 0) throw new Error("Thread has no messages");
    const lastRaw = messages[messages.length - 1];
    const getHdr = (m: typeof lastRaw, name: string) =>
      m.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

    const lastFrom = this.parseEmailAddress(getHdr(lastRaw, "From"));
    const lastToAll = this.parseRecipients(getHdr(lastRaw, "To"));
    const lastCcAll = this.parseRecipients(getHdr(lastRaw, "Cc"));
    const lastSubject = getHdr(lastRaw, "Subject");
    const rawMessageId = getHdr(lastRaw, "Message-ID");
    // Fall back to Gmail internal ID wrapped in angle brackets for valid RFC 2822 Message-ID
    const lastMessageId = rawMessageId || (lastRaw.id ? `<${lastRaw.id}@mail.gmail.com>` : "");

    // Build full References chain per RFC 2822 §3.6.4
    const lastReferences = getHdr(lastRaw, "References");
    const references = lastReferences
      ? `${lastReferences} ${lastMessageId}`
      : lastMessageId;

    // Get our own email to exclude from reply-all (not firstTo which may be wrong)
    const myProfile = await this.getProfile();
    const myEmail = myProfile.email.toLowerCase();

    // Reply-all: include original sender + all To/Cc, minus ourselves
    const to = params.replyAll
      ? [lastFrom, ...lastToAll, ...lastCcAll].filter(
          (a, i, arr) =>
            a.email.toLowerCase() !== myEmail &&
            arr.findIndex((b) => b.email.toLowerCase() === a.email.toLowerCase()) === i // dedupe
        )
      : [lastFrom];

    const sendParams: SendParams = {
      to,
      cc: params.cc,
      bcc: params.bcc,
      subject: lastSubject.startsWith("Re:") ? lastSubject : `Re: ${lastSubject}`,
      body: params.body,
      bodyText: params.bodyText,
      attachments: params.attachments,
      inReplyTo: lastMessageId,
      references,
    };

    const raw = this.buildRawEmail(sendParams);
    const res = await withBackoff(() => this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId },
    }));
    const msg = await withBackoff(() => this.gmail.users.messages.get({
      userId: "me",
      id: res.data.id!,
      format: "FULL",
    }));
    return this.parseMessage(msg.data);
  }

  async forward(messageId: string, params: ForwardParams): Promise<Message> {
    const original = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "FULL",
    });
    const parsed = this.parseMessage(original.data);

    // Sanitize original email body before embedding in forward to prevent XSS
    const { sanitizeTemplateHtml } = await import("./sanitize");
    const sanitizedOriginal = sanitizeTemplateHtml(parsed.body);

    const forwardBody = params.body
      ? `${params.body}<br><br>---------- Forwarded message ----------<br>${sanitizedOriginal}`
      : `---------- Forwarded message ----------<br>From: ${escapeHtml(parsed.from.email)}<br>Date: ${escapeHtml(parsed.date)}<br>Subject: ${escapeHtml(parsed.subject)}<br><br>${sanitizedOriginal}`;

    // Carry over original attachments in parallel (convert Buffer → base64 string for send)
    const originalAttachments: { filename: string; mimeType: string; data: string }[] = [];
    if (parsed.attachments?.length) {
      const results = await Promise.allSettled(
        parsed.attachments
          .filter((att) => att.id)
          .map((att) =>
            this.getAttachment(messageId, att.id!, { filename: att.filename, mimeType: att.mimeType })
              .then((fetched) => ({ filename: fetched.filename, mimeType: fetched.mimeType, data: fetched.data.toString("base64") }))
          )
      );
      for (const r of results) {
        if (r.status === "fulfilled") originalAttachments.push(r.value);
      }
    }

    return this.send({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: `Fwd: ${parsed.subject}`,
      body: forwardBody,
      attachments: [...originalAttachments, ...(params.attachments ?? [])],
    });
  }

  async createDraft(params: DraftParams): Promise<Draft> {
    const raw = this.buildRawEmail(params);
    const res = await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });
    const draft = await this.gmail.users.drafts.get({
      userId: "me",
      id: res.data.id!,
      format: "FULL",
    });
    return {
      id: draft.data.id!,
      message: this.parseMessage(draft.data.message!),
    };
  }

  async search(query: string, maxResults = 25): Promise<ThreadList> {
    return this.listThreads({ query, maxResults });
  }

  async listLabels(): Promise<Label[]> {
    const res = await withBackoff(() => this.gmail.users.labels.list({ userId: "me" }));
    const labels = res.data.labels ?? [];

    // Fetch label details in batches of 10 to avoid hammering the API
    const BATCH_SIZE = 10;
    const details: { l: typeof labels[number]; d: gmail_v1.Schema$Label }[] = [];
    for (let i = 0; i < labels.length; i += BATCH_SIZE) {
      const batch = labels.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((l) =>
          withBackoff(() => this.gmail.users.labels.get({ userId: "me", id: l.id! })).then((d) => ({ l, d: d.data }))
        )
      );
      details.push(...batchResults);
    }

    return details.map(({ l, d }) => ({
      id: l.id!,
      name: l.name!,
      type: l.type === "system" ? "system" as const : "user" as const,
      messageCount: d.messagesTotal ?? undefined,
      unreadCount: d.messagesUnread ?? undefined,
      color: d.color?.backgroundColor ?? undefined,
    }));
  }

  async getAttachment(messageId: string, attachmentId: string, meta?: { filename?: string; mimeType?: string }): Promise<Attachment> {
    const res = await this.gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const data = Buffer.from(res.data.data ?? "", "base64url");
    return {
      data,
      filename: meta?.filename ?? "attachment",
      mimeType: meta?.mimeType ?? "application/octet-stream",
      size: data.length,
    };
  }

  async watchInbox(topicName: string): Promise<{ historyId: string; expiration: string }> {
    // Omit labelIds to watch ALL label changes including user-created labels.
    // Specifying labelIds would miss custom label changes and cause stale UI.
    const res = await withBackoff(() => this.gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
      },
    }));
    return {
      historyId: res.data.historyId ?? "",
      expiration: res.data.expiration ?? "",
    };
  }

  async listHistory(startHistoryId: string): Promise<{
    historyId: string;
    changes: { threadId: string; type: "added" | "removed" | "labelChanged" }[];
  }> {
    try {
      const res = await withBackoff(() => this.gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
      }));

      const changes: { threadId: string; type: "added" | "removed" | "labelChanged" }[] = [];
      // Dedup per (threadId, type) so a thread with both messageAdded and labelChanged
      // emits both events instead of silently dropping the second one
      const seen = new Set<string>();

      for (const record of res.data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          const tid = added.message?.threadId;
          const key = `${tid}:added`;
          if (tid && !seen.has(key)) {
            seen.add(key);
            changes.push({ threadId: tid, type: "added" });
          }
        }
        for (const removed of record.messagesDeleted ?? []) {
          const tid = removed.message?.threadId;
          const key = `${tid}:removed`;
          if (tid && !seen.has(key)) {
            seen.add(key);
            changes.push({ threadId: tid, type: "removed" });
          }
        }
        for (const label of [...(record.labelsAdded ?? []), ...(record.labelsRemoved ?? [])]) {
          const tid = label.message?.threadId;
          const key = `${tid}:labelChanged`;
          if (tid && !seen.has(key)) {
            seen.add(key);
            changes.push({ threadId: tid, type: "labelChanged" });
          }
        }
      }

      return {
        historyId: res.data.historyId ?? startHistoryId,
        changes,
      };
    } catch (err: unknown) {
      // If historyId is too old (>7 days), Gmail returns 404.
      // Recover by fetching the current historyId so we don't loop forever.
      if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 404) {
        try {
          const profile = await this.gmail.users.getProfile({ userId: "me" });
          const freshHistoryId = profile.data.historyId ?? startHistoryId;
          return { historyId: freshHistoryId, changes: [] };
        } catch {
          return { historyId: startHistoryId, changes: [] };
        }
      }
      throw err;
    }
  }

  async getProfile(): Promise<EmailProfile> {
    const res = await this.gmail.users.getProfile({ userId: "me" });
    const email = res.data.emailAddress ?? "";

    // Derive display name from email prefix.
    // People API was removed: it always failed with 403 (missing scope),
    // wasting ~300ms on every reply operation.
    const name = email.split("@")[0]?.replace(/[._]/g, " ") ?? email;

    return { email, name };
  }

  // ── Private helpers ─────────────────────────────────────

  private parseThreadListItem(data: gmail_v1.Schema$Thread): ThreadListItem {
    const messages = data.messages ?? [];
    if (messages.length === 0) {
      return {
        id: data.id ?? "",
        subject: "(no subject)",
        snippet: data.snippet ?? "",
        from: [],
        to: [],
        labelIds: [],
        isUnread: false,
        isStarred: false,
        lastMessageAt: new Date().toISOString(),
        messageCount: 0,
      };
    }

    const firstMsg = messages[0];
    const lastMsg = messages[messages.length - 1];
    const allLabels = new Set<string>();
    let isUnread = false;
    let isStarred = false;

    for (const m of messages) {
      for (const l of m.labelIds ?? []) allLabels.add(l);
      if (m.labelIds?.includes("UNREAD")) isUnread = true;
      if (m.labelIds?.includes("STARRED")) isStarred = true;
    }

    return {
      id: data.id ?? "",
      subject: this.getHeader(firstMsg, "Subject") || "(no subject)",
      snippet: data.snippet ?? "",
      from: messages.map((m) => this.parseEmailAddress(this.getHeader(m, "From"))),
      to: [this.parseEmailAddress(this.getHeader(firstMsg, "To"))],
      labelIds: Array.from(allLabels),
      isUnread,
      isStarred,
      lastMessageAt: lastMsg.internalDate
        ? new Date(parseInt(lastMsg.internalDate)).toISOString()
        : new Date().toISOString(),
      messageCount: messages.length,
    };
  }

  private parseThread(data: gmail_v1.Schema$Thread): Thread {
    const listItem = this.parseThreadListItem(data);
    return {
      ...listItem,
      messages: (data.messages ?? []).map((m) => this.parseMessage(m)),
    };
  }

  private parseMessage(data: gmail_v1.Schema$Message): Message {
    const body = this.getBody(data.payload);
    const attachments = this.getAttachments(data.payload);

    return {
      id: data.id!,
      threadId: data.threadId!,
      from: this.parseEmailAddress(this.getHeader(data, "From")),
      to: this.parseRecipients(this.getHeader(data, "To")),
      cc: this.parseRecipients(this.getHeader(data, "Cc")),
      bcc: this.parseRecipients(this.getHeader(data, "Bcc")),
      subject: this.getHeader(data, "Subject") || "(no subject)",
      body: body.html || body.text || "",
      bodyText: body.text || "",
      date: data.internalDate
        ? new Date(parseInt(data.internalDate)).toISOString()
        : new Date().toISOString(),
      attachments,
      isUnread: data.labelIds?.includes("UNREAD") ?? false,
    };
  }

  private getHeader(msg: gmail_v1.Schema$Message | undefined, name: string): string {
    if (!msg?.payload?.headers) return "";
    const header = msg.payload.headers.find(
      (h) => h.name?.toLowerCase() === name.toLowerCase()
    );
    return header?.value ?? "";
  }

  private parseEmailAddress(raw: string): EmailAddress {
    if (!raw) return { name: "", email: "" };
    const match = raw.match(/^(.+?)\s*<(.+?)>$/);
    if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
    // Bare email — don't duplicate it as both name and email
    return { name: "", email: raw.trim() };
  }

  private parseRecipients(raw: string): EmailAddress[] {
    if (!raw) return [];
    // Split on commas that are NOT inside quotes (handles "Jones, Jon" <jon@supra.com>)
    const addresses: string[] = [];
    let current = "";
    let inQuotes = false;
    let inAngle = false;
    for (const ch of raw) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "<" && !inQuotes) { inAngle = true; current += ch; continue; }
      else if (ch === ">" && !inQuotes) { inAngle = false; current += ch; continue; }
      else if (ch === "," && !inQuotes && !inAngle) {
        if (current.trim()) addresses.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) addresses.push(current.trim());
    return addresses.map((r) => this.parseEmailAddress(r));
  }

  private getBody(payload: gmail_v1.Schema$MessagePart | undefined): { html: string; text: string } {
    if (!payload) return { html: "", text: "" };

    const htmlParts: string[] = [];
    const textParts: string[] = [];

    function walk(part: gmail_v1.Schema$MessagePart) {
      if (part.mimeType === "text/html" && part.body?.data) {
        htmlParts.push(Buffer.from(part.body.data, "base64url").toString("utf-8"));
      } else if (part.mimeType === "text/plain" && part.body?.data) {
        textParts.push(Buffer.from(part.body.data, "base64url").toString("utf-8"));
      }
      for (const p of part.parts ?? []) walk(p);
    }

    walk(payload);
    return { html: htmlParts.join(""), text: textParts.join("") };
  }

  private getAttachments(payload: gmail_v1.Schema$MessagePart | undefined): AttachmentMeta[] {
    if (!payload) return [];
    const attachments: AttachmentMeta[] = [];

    function walk(part: gmail_v1.Schema$MessagePart) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType ?? "application/octet-stream",
          size: part.body.size ?? 0,
        });
      }
      for (const p of part.parts ?? []) walk(p);
    }

    walk(payload);
    return attachments;
  }

  private sanitizeHeaderValue(value: string): string {
    // Strip \r and \n to prevent header injection
    return value.replace(/[\r\n]/g, "");
  }

  private buildRawEmail(params: SendParams): string {
    const randomHex = () => {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    };
    const boundary = `boundary_${randomHex()}`;
    const hasAttachments = params.attachments && params.attachments.length > 0;
    const mixedBoundary = hasAttachments ? `mixed_${randomHex()}` : null;

    const formatAddr = (a: EmailAddress) => {
      const name = a.name ? this.sanitizeHeaderValue(a.name).replace(/"/g, "'") : "";
      const email = this.sanitizeHeaderValue(a.email);
      return name ? `"${name}" <${email}>` : email;
    };
    const to = params.to.map(formatAddr).join(", ");
    const cc = params.cc?.map(formatAddr).join(", ");
    const bcc = params.bcc?.map(formatAddr).join(", ");

    const headers = [
      `To: ${to}`,
      `Subject: ${this.sanitizeHeaderValue(params.subject)}`,
      `MIME-Version: 1.0`,
      `Date: ${new Date().toUTCString()}`,
    ];

    // Add From header if we know our email (prevents wrong send-as alias)
    if (params.from) {
      headers.push(`From: ${formatAddr(params.from)}`);
    }

    if (cc) headers.push(`Cc: ${cc}`);
    if (bcc) headers.push(`Bcc: ${bcc}`);
    if (params.inReplyTo) headers.push(`In-Reply-To: ${this.sanitizeHeaderValue(params.inReplyTo)}`);
    if (params.references) headers.push(`References: ${this.sanitizeHeaderValue(params.references)}`);

    const textPart = params.bodyText || params.body.replace(/<[^>]+>/g, "");

    if (hasAttachments && mixedBoundary) {
      // multipart/mixed wrapping multipart/alternative + attachments
      headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

      const parts = [
        headers.join("\r\n"),
        "",
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(textPart, "utf-8").toString("base64"),
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(params.body, "utf-8").toString("base64"),
        `--${boundary}--`,
      ];

      for (const att of params.attachments!) {
        // Sanitize filename: strip path traversal, control chars, and MIME injection
        const safeName = att.filename
          .replace(/[/\\]/g, "_")
          .replace(/[\r\n\0"]/g, "")
          .slice(0, 255) || "attachment";
        parts.push(
          `--${mixedBoundary}`,
          `Content-Type: ${/^[\w\-]+\/[\w\-.+]+$/.test(att.mimeType) ? att.mimeType : "application/octet-stream"}; name="${safeName}"`,
          `Content-Disposition: attachment; filename="${safeName}"`,
          `Content-Transfer-Encoding: base64`,
          "",
          att.data
        );
      }
      parts.push(`--${mixedBoundary}--`);

      return Buffer.from(parts.join("\r\n")).toString("base64url");
    } else {
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

      const email = [
        headers.join("\r\n"),
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(textPart, "utf-8").toString("base64"),
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(params.body, "utf-8").toString("base64"),
        `--${boundary}--`,
      ].join("\r\n");

      return Buffer.from(email).toString("base64url");
    }
  }
}
