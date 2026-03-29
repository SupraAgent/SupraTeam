import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { sanitizeEmailError } from "@/lib/email/errors";

/** POST: Save a draft */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: {
    to?: { name: string; email: string }[];
    cc?: { name: string; email: string }[];
    bcc?: { name: string; email: string }[];
    subject?: string;
    body: string;
    bodyText?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.body && body.body.length > 500_000) {
    return NextResponse.json({ error: "Draft body exceeds 500KB limit" }, { status: 400 });
  }

  // Sanitize HTML before creating draft to prevent stored XSS
  const { sanitizeTemplateHtml } = await import("@/lib/email/sanitize");
  const sanitizedBody = sanitizeTemplateHtml(body.body);

  try {
    const { driver } = await getDriverForUser(auth.user.id);
    const draft = await driver.createDraft({
      to: body.to ?? [],
      subject: body.subject ?? "",
      body: sanitizedBody,
      bodyText: body.bodyText,
      cc: body.cc,
      bcc: body.bcc,
    });

    return NextResponse.json({ data: draft, source: "gmail" });
  } catch (err: unknown) {
    const { message, status, reconnect } = sanitizeEmailError(err, "Failed to save draft");
    return NextResponse.json({ error: message, reconnect }, { status });
  }
}
