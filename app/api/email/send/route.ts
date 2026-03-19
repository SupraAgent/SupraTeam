import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import type { SendParams, ReplyParams, ForwardParams } from "@/lib/email/types";

/** POST: Send, reply, or forward an email */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

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
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Email body is required" }, { status: 400 });
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

    // Audit log
    await auth.admin.from("crm_email_audit_log").insert({
      user_id: auth.user.id,
      action: `email_${body.type}`,
      thread_id: body.threadId ?? result?.threadId,
      recipient: body.to?.[0]?.email ?? undefined,
      metadata: {
        connection_email: connection.email,
        subject: body.subject,
      },
    });

    return NextResponse.json({ data: result, source: "gmail" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
