// ── Email Types ──────────────────────────────────────────────

export type EmailProvider = "gmail" | "outlook";

export type EmailAddress = {
  name: string;
  email: string;
};

export type AttachmentMeta = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type Message = {
  id: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  body: string; // sanitized HTML
  bodyText: string; // plain text fallback
  date: string; // ISO
  attachments: AttachmentMeta[];
  isUnread: boolean;
};

export type Thread = {
  id: string;
  subject: string;
  snippet: string;
  from: EmailAddress[];
  to: EmailAddress[];
  messages: Message[];
  labelIds: string[];
  isUnread: boolean;
  isStarred: boolean;
  lastMessageAt: string;
  messageCount: number;
};

export type ThreadListItem = Omit<Thread, "messages"> & {
  messages?: undefined;
};

export type ThreadList = {
  threads: ThreadListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

// ── Split Inbox Categories ──────────────────────────────────

export type InboxCategory = "important" | "updates" | "other";

export const INBOX_CATEGORIES: { id: InboxCategory; label: string; description: string }[] = [
  { id: "important", label: "Important", description: "Direct emails from people" },
  { id: "updates", label: "Updates", description: "Notifications & automated" },
  { id: "other", label: "Other", description: "Newsletters, promotions" },
];

export type Label = {
  id: string;
  name: string;
  type: "system" | "user";
  messageCount?: number;
  unreadCount?: number;
  color?: string;
};

export type EmailProfile = {
  email: string;
  name: string;
  picture?: string;
};

export type Attachment = {
  data: Buffer;
  filename: string;
  mimeType: string;
  size: number;
};

// ── Send / Reply / Forward ──────────────────────────────────

export type SendParams = {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string; // HTML
  bodyText?: string;
  attachments?: File[];
  inReplyTo?: string; // Message-Id header for threading
  references?: string; // References header
};

export type ReplyParams = {
  body: string;
  bodyText?: string;
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  attachments?: File[];
  replyAll?: boolean;
};

export type ForwardParams = {
  to: EmailAddress[];
  body?: string; // optional added text
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
};

export type DraftParams = SendParams;

export type Draft = {
  id: string;
  message: Message;
};

// ── List params ─────────────────────────────────────────────

export type ListThreadsParams = {
  labelIds?: string[];
  query?: string;
  maxResults?: number;
  pageToken?: string;
};

// ── Driver interface ────────────────────────────────────────

export interface MailDriver {
  // Threads
  listThreads(params: ListThreadsParams): Promise<ThreadList>;
  getThread(threadId: string): Promise<Thread>;

  // Actions
  markAsRead(threadId: string): Promise<void>;
  markAsUnread(threadId: string): Promise<void>;
  archive(threadId: string): Promise<void>;
  trash(threadId: string): Promise<void>;
  toggleStar(threadId: string): Promise<void>;
  modifyLabels(threadId: string, add: string[], remove: string[]): Promise<void>;

  // Send
  send(params: SendParams): Promise<Message>;
  reply(threadId: string, params: ReplyParams): Promise<Message>;
  forward(messageId: string, params: ForwardParams): Promise<Message>;
  createDraft(params: DraftParams): Promise<Draft>;

  // Search
  search(query: string, maxResults?: number): Promise<ThreadList>;

  // Labels
  listLabels(): Promise<Label[]>;

  // Attachments
  getAttachment(messageId: string, attachmentId: string): Promise<Attachment>;

  // Metadata
  getProfile(): Promise<EmailProfile>;
}

// ── Connection record ───────────────────────────────────────

export type EmailConnection = {
  id: string;
  user_id: string;
  provider: EmailProvider;
  email: string;
  is_default: boolean;
  connected_at: string;
  last_sync_at: string | null;
};

// ── Template types ──────────────────────────────────────────

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  variables: string[];
  board_type: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

// ── Sequence types ──────────────────────────────────────────

export type SequenceStep = {
  delay_days: number;
  template_id: string;
  subject_override?: string;
};

export type EmailSequence = {
  id: string;
  name: string;
  description: string | null;
  steps: SequenceStep[];
  board_type: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
};

export type SequenceEnrollment = {
  id: string;
  sequence_id: string;
  deal_id: string;
  contact_id: string;
  current_step: number;
  status: "active" | "paused" | "completed" | "replied" | "bounced";
  next_send_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
};
