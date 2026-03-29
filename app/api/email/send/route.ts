import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import type { SendParams, ReplyParams, ForwardParams } from "@/lib/email/types";
import { logEmailAction } from "@/lib/email/audit";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeEmailError } from "@/lib/email/errors";

/** POST: Send, reply, or forward an email */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rl = rateLimit(`email-send:${auth.user.id}`, { max: 10, windowSec: 60 });
  if (rl) return rl;

  let body: {
    type: "send" | "reply" | "forward";
    threadId?: string;
    messageId?: string;
    to?: { name: string; email: string }[];
    cc?: { name: string; email: string }[];
    bcc?: { name: string; email: string }[];
    subject?: string;
    body: string;
    bodyText?: string;
    replyAll?: boolean;
    attachments?: { filename: string; mimeType: string; data: string }[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Email body is required" }, { status: 400 });
  }

  // Input length validation
  const MAX_BODY = 500_000; // ~500KB
  const MAX_SUBJECT = 1_000;
  const MAX_RECIPIENTS = 100;
  const MAX_ATTACHMENTS = 25;
  const MAX_ATTACHMENT_SIZE = 10_000_000; // ~10MB base64

  if (body.body.length > MAX_BODY) {
    return NextResponse.json({ error: `Email body exceeds ${MAX_BODY} character limit` }, { status: 400 });
  }
  if (body.subject && body.subject.length > MAX_SUBJECT) {
    return NextResponse.json({ error: `Subject exceeds ${MAX_SUBJECT} character limit` }, { status: 400 });
  }
  const totalRecipients = (body.to?.length ?? 0) + (body.cc?.length ?? 0) + (body.bcc?.length ?? 0);
  if (totalRecipients > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Too many recipients (max ${MAX_RECIPIENTS})` }, { status: 400 });
  }
  if (body.attachments) {
    if (body.attachments.length > MAX_ATTACHMENTS) {
      return NextResponse.json({ error: `Too many attachments (max ${MAX_ATTACHMENTS})` }, { status: 400 });
    }
    for (const att of body.attachments) {
      if (att.data.length > MAX_ATTACHMENT_SIZE) {
        return NextResponse.json({ error: `Attachment "${att.filename}" exceeds 10MB limit` }, { status: 400 });
      }
    }
  }

  try {
    const { driver, connection } = await getDriverForUser(auth.user.id);
    let result;

    switch (body.type) {
      case "send": {
        if (!body.to?.length) {
          return NextResponse.json({ error: "Recipients required" }, { status: 400 });
        }
        const sendParams: SendParams = {
          to: body.to,
          cc: body.cc,
          bcc: body.bcc,
          subject: body.subject ?? "(no subject)",
          body: body.body,
          bodyText: body.bodyText,
          attachments: body.attachments,
        };
        result = await driver.send(sendParams);
        break;
      }
      case "reply": {
        if (!body.threadId) {
          return NextResponse.json({ error: "threadId required for reply" }, { status: 400 });
        }
        const replyParams: ReplyParams = {
          body: body.body,
          bodyText: body.bodyText,
          cc: body.cc,
          bcc: body.bcc,
          attachments: body.attachments,
          replyAll: body.replyAll,
        };
        result = await driver.reply(body.threadId, replyParams);
        break;
      }
      case "forward": {
        if (!body.messageId || !body.to?.length) {
          return NextResponse.json({ error: "messageId and to required for forward" }, { status: 400 });
        }
        const fwdParams: ForwardParams = {
          to: body.to,
          body: body.body,
          cc: body.cc,
          bcc: body.bcc,
        };
        result = await driver.forward(body.messageId, fwdParams);
        break;
      }
      default:
        return NextResponse.json({ error: "type must be send, reply, or forward" }, { status: 400 });
    }

    // Audit log — fire-and-forget, don't block response
    logEmailAction(auth.admin, {
      userId: auth.user.id,
      action: `email_${body.type}`,
      threadId: body.threadId ?? result?.threadId,
      recipient: body.to?.[0]?.email,
      metadata: { connection_email: connection.email, subject: body.subject?.slice(0, 50) },
    });

    return NextResponse.json({ data: result, source: "gmail" });
  } catch (err: unknown) {
    const { message, status, reconnect } = sanitizeEmailError(err, "Failed to send");
    return NextResponse.json({ error: message, reconnect }, { status });
  }
}
