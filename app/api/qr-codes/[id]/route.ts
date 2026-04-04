import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { generateQrSvg } from "@/lib/qr-svg";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, admin } = auth;

  // Fetch QR code with stage info (RLS scoped to user)
  const { data: qrCode, error } = await supabase
    .from("crm_qr_codes")
    .select("*, stage:pipeline_stages(id, name)")
    .eq("id", id)
    .single();

  if (error || !qrCode) {
    return NextResponse.json({ error: "QR code not found" }, { status: 404 });
  }

  // Fetch scan history
  const { data: scans } = await supabase
    .from("crm_qr_scans")
    .select("id, telegram_user_id, scanned_at, ip_hint, converted_to_deal_id")
    .eq("qr_code_id", id)
    .order("scanned_at", { ascending: false })
    .limit(100);

  // Compute stats
  const totalScans = scans?.length ?? 0;
  const conversions = (scans ?? []).filter((s: { converted_to_deal_id: string | null }) => s.converted_to_deal_id).length;
  const uniqueUsers = new Set((scans ?? []).map((s: { telegram_user_id: number | null }) => s.telegram_user_id).filter(Boolean)).size;

  // Fetch assigned profile name via admin
  let assignedProfile: { display_name: string; avatar_url: string } | null = null;
  if (qrCode.assigned_to) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", qrCode.assigned_to)
      .single();
    assignedProfile = profile ?? null;
  }

  // Generate deep link and SVG
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const deepLink = botUsername
    ? `https://t.me/${botUsername}?start=qr_${qrCode.id}`
    : `qr_${qrCode.id}`;

  const svgQr = generateQrSvg(deepLink, 300);

  return NextResponse.json({
    data: {
      ...qrCode,
      assigned_profile: assignedProfile,
      deep_link: deepLink,
      svg: svgQr,
      stats: {
        total_scans: totalScans,
        conversions,
        unique_users: uniqueUsers,
        conversion_rate: totalScans > 0 ? Math.round((conversions / totalScans) * 100) : 0,
      },
      scans: scans ?? [],
    },
    source: "supabase",
  });
}
