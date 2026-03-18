import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("name, email, phone, company, title, telegram_username, notes, created_at")
    .order("name");

  if (!contacts || contacts.length === 0) {
    return new NextResponse("No contacts to export", { status: 404 });
  }

  const headers = ["Name", "Email", "Phone", "Company", "Title", "Telegram", "Notes", "Created"];
  const rows = contacts.map((c) => [
    c.name,
    c.email ?? "",
    c.phone ?? "",
    c.company ?? "",
    c.title ?? "",
    c.telegram_username ?? "",
    (c.notes ?? "").replace(/,/g, ";"),
    c.created_at?.split("T")[0] ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
