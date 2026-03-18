import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: deals } = await supabase
    .from("crm_deals")
    .select("deal_name, board_type, value, probability, stage:pipeline_stages(name), contact:crm_contacts(name), created_at, updated_at")
    .order("created_at", { ascending: false });

  if (!deals || deals.length === 0) {
    return new NextResponse("No deals to export", { status: 404 });
  }

  const headers = ["Deal Name", "Board", "Stage", "Contact", "Value", "Probability", "Created", "Updated"];
  const rows = deals.map((d: Record<string, unknown>) => {
    const stage = d.stage as { name: string } | null;
    const contact = d.contact as { name: string } | null;
    return [
      d.deal_name as string,
      d.board_type as string,
      stage?.name ?? "",
      contact?.name ?? "",
      String(d.value ?? ""),
      String(d.probability ?? ""),
      (d.created_at as string)?.split("T")[0] ?? "",
      (d.updated_at as string)?.split("T")[0] ?? "",
    ];
  });

  const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="deals-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
