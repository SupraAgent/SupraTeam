import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";

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

  try {
    const { driver } = await getDriverForUser(auth.user.id);
    const draft = await driver.createDraft({
      to: body.to ?? [],
      subject: body.subject ?? "",
      body: body.body,
      bodyText: body.bodyText,
      cc: body.cc,
      bcc: body.bcc,
    });

    return NextResponse.json({ data: draft, source: "gmail" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
