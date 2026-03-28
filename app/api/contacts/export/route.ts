import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("name, email, phone, company, title, telegram_username, x_handle, wallet_address, wallet_chain, on_chain_score, notes, created_at")
    .order("name");

  if (!contacts || contacts.length === 0) {
    return new NextResponse("No contacts to export", { status: 404 });
  }

  const headers = ["Name", "Email", "Phone", "Company", "Title", "Telegram", "X Handle", "Wallet Address", "Wallet Chain", "On-Chain Score", "Notes", "Created"];
  // Sanitize CSV cell: escape double quotes per RFC 4180, prevent formula injection
  function csvCell(val: string): string {
    let safe = val.replace(/"/g, '""');
    // Prevent CSV formula injection — prefix dangerous first chars with a single quote
    if (/^[=+\-@\t\r]/.test(safe)) safe = "'" + safe;
    return `"${safe}"`;
  }

  const rows = contacts.map((c) => [
    c.name,
    c.email ?? "",
    c.phone ?? "",
    c.company ?? "",
    c.title ?? "",
    c.telegram_username ?? "",
    c.x_handle ?? "",
    c.wallet_address ?? "",
    c.wallet_chain ?? "",
    String(c.on_chain_score ?? 0),
    c.notes ?? "",
    c.created_at?.split("T")[0] ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.map((v) => csvCell(v)).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
