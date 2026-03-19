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

type GmailConfig = {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
};

export class GmailDriver implements MailDriver {
  private gmail: gmail_v1.Gmail;
  private auth: InstanceType<typeof google.auth.OAuth2>;

  constructor(config: GmailConfig) {
    this.auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
    this.auth.setCredentials({
      access_token: config.accessToken,
      refresh_token: config.refreshToken,
    });
    this.gmail = google.gmail({ version: "v1", auth: this.auth });
  }

  /** Get refreshed access token (auto-refreshes if expired) */
  async getAccessToken(): Promise<string> {
    const { token } = await this.auth.getAccessToken();
    return token ?? "";
  }

  async listThreads(params: ListThreadsParams): Promise<ThreadList> {
    const res = await this.gmail.users.threads.list({
      userId: "me",
      labelIds: params.labelIds,
      q: params.query,
      maxResults: params.maxResults ?? 25,
      pageToken: params.pageToken,
    });

    const threads: ThreadListItem[] = [];
    for (const t of res.data.threads ?? []) {
      // Fetch minimal thread data for list view
      const full = await this.gmail.users.threads.get({
        userId: "me",
        id: t.id!,
        format: "METADATA",
        metadataHeaders: ["Subject", "From", "To", "Date"],
      });
      threads.push(this.parseThreadListItem(full.data));
    }

    return {
      threads,
      nextPageToken: res.data.nextPageToken ?? undefined,
      resultSizeEstimate: res.data.resultSizeEstimate ?? undefined,
    };
  }

  async getThread(threadId: string): Promise<Thread> {
    const res = await this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "FULL",
    });
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

  async toggleStar(threadId: string): Promise<void> {
    // Get current state
    const thread = await this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "MINIMAL",
    });
    const firstMsg = thread.data.messages?.[0];
    const isStarred = firstMsg?.labelIds?.includes("STARRED") ?? false;

    if (isStarred) {
      await this.gmail.users.messages.modify({
        userId: "me",
        id: firstMsg!.id!,
        requestBody: { removeLabelIds: ["STARRED"] },
      });
    } else {
      await this.gmail.users.messages.modify({
        userId: "me",
        id: firstMsg!.id!,
        requestBody: { addLabelIds: ["STARRED"] },
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
    const res = await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    const msg = await this.gmail.users.messages.get({
      userId: "me",
      id: res.data.id!,
      format: "FULL",
    });
    return this.parseMessage(msg.data);
  }

  async reply(threadId: string, params: ReplyParams): Promise<Message> {
    // Get the thread to find the last message for headers
    const thread = await this.getThread(threadId);
    const lastMsg = thread.messages[thread.messages.length - 1];

    const to = params.replyAll
      ? [...lastMsg.to, lastMsg.from].filter((a) => a.email !== thread.messages[0].to[0]?.email)
      : [lastMsg.from];

    const sendParams: SendParams = {
      to,
      cc: params.cc,
      bcc: params.bcc,
      subject: lastMsg.subject.startsWith("Re:") ? lastMsg.subject : `Re: ${lastMsg.subject}`,
      body: params.body,
      bodyText: params.bodyText,
      inReplyTo: lastMsg.id,
      references: lastMsg.id,
    };

    const raw = this.buildRawEmail(sendParams);
    const res = await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId },
    });
    const msg = await this.gmail.users.messages.get({
      userId: "me",
      id: res.data.id!,
      format: "FULL",
    });
    return this.parseMessage(msg.data);
  }

  async forward(messageId: string, params: ForwardParams): Promise<Message> {
    const original = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "FULL",
    });
    const parsed = this.parseMessage(original.data);
    const forwardBody = params.body
      ? `${params.body}<br><br>---------- Forwarded message ----------<br>${parsed.body}`
      : `---------- Forwarded message ----------<br>From: ${parsed.from.email}<br>Date: ${parsed.date}<br>Subject: ${parsed.subject}<br><br>${parsed.body}`;

    return this.send({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: `Fwd: ${parsed.subject}`,
      body: forwardBody,
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
    const res = await this.gmail.users.labels.list({ userId: "me" });
    const labels: Label[] = [];
    for (const l of res.data.labels ?? []) {
      const detail = await this.gmail.users.labels.get({
        userId: "me",
        id: l.id!,
      });
      labels.push({
        id: l.id!,
        name: l.name!,
        type: l.type === "system" ? "system" : "user",
        messageCount: detail.data.messagesTotal ?? undefined,
        unreadCount: detail.data.messagesUnread ?? undefined,
        color: detail.data.color?.backgroundColor ?? undefined,
      });
    }
    return labels;
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Attachment> {
    const res = await this.gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const data = Buffer.from(res.data.data ?? "", "base64url");
    return {
      data,
      filename: "attachment",
      mimeType: "application/octet-stream",
      size: data.length,
    };
  }

  async getProfile(): Promise<EmailProfile> {
    const res = await this.gmail.users.getProfile({ userId: "me" });
    return {
      email: res.data.emailAddress ?? "",
      name: res.data.emailAddress ?? "",
    };
  }

  // ── Private helpers ─────────────────────────────────────

  private parseThreadListItem(data: gmail_v1.Schema$Thread): ThreadListItem {
    const messages = data.messages ?? [];
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
      id: data.id!,
      subject: this.getHeader(firstMsg, "Subject") || "(no subject)",
      snippet: data.snippet ?? "",
      from: messages.map((m) => this.parseEmailAddress(this.getHeader(m, "From"))),
      to: firstMsg ? [this.parseEmailAddress(this.getHeader(firstMsg, "To"))] : [],
      labelIds: Array.from(allLabels),
      isUnread,
      isStarred,
      lastMessageAt: lastMsg?.internalDate
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
    return { name: raw, email: raw };
  }

  private parseRecipients(raw: string): EmailAddress[] {
    if (!raw) return [];
    return raw.split(",").map((r) => this.parseEmailAddress(r.trim()));
  }

  private getBody(payload: gmail_v1.Schema$MessagePart | undefined): { html: string; text: string } {
    if (!payload) return { html: "", text: "" };

    let html = "";
    let text = "";

    function walk(part: gmail_v1.Schema$MessagePart) {
      if (part.mimeType === "text/html" && part.body?.data) {
        html = Buffer.from(part.body.data, "base64url").toString("utf-8");
      } else if (part.mimeType === "text/plain" && part.body?.data) {
        text = Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
      for (const p of part.parts ?? []) walk(p);
    }

    walk(payload);
    return { html, text };
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

  private buildRawEmail(params: SendParams): string {
    const boundary = `boundary_${Date.now()}`;
    const to = params.to.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(", ");
    const cc = params.cc?.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(", ");
    const bcc = params.bcc?.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(", ");

    let headers = [
      `To: ${to}`,
      `Subject: ${params.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ];

    if (cc) headers.push(`Cc: ${cc}`);
    if (bcc) headers.push(`Bcc: ${bcc}`);
    if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
    if (params.references) headers.push(`References: ${params.references}`);

    const textPart = params.bodyText || params.body.replace(/<[^>]+>/g, "");
    const email = [
      headers.join("\r\n"),
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      textPart,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      params.body,
      `--${boundary}--`,
    ].join("\r\n");

    return Buffer.from(email).toString("base64url");
  }
}
