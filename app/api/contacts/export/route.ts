import { NextResponse } from "next/server";
import { requireLeadRole } from "@/lib/auth-guard";
import { escapeCSV } from "@/lib/utils";

export async function GET() {
  const auth = await requireLeadRole();
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

  const csv = [headers.join(","), ...rows.map((r) => r.map((v) => escapeCSV(v)).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
