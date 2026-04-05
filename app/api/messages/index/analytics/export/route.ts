/**
 * GET /api/messages/index/analytics/export — Export analytics data as CSV.
 *
 * Query params:
 *   metric    — one of: volume, top_senders, response_time, heatmap
 *   chat_id   — optional chat filter
 *   after     — ISO date
 *   before    — ISO date
 *   timezone  — IANA timezone (default: UTC)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric");
  const chatId = searchParams.get("chat_id");
  const after = searchParams.get("after");
  const before = searchParams.get("before");
  const timezone = searchParams.get("timezone") ?? "UTC";

  if (!metric) {
    return NextResponse.json({ error: "metric required" }, { status: 400 });
  }

  const rpcParams = {
    p_user_id: user.id,
    p_chat_id: chatId ? Number(chatId) : null,
    p_after: after,
    p_before: before,
  };

  let csv = "";
  let filename = `analytics_${metric}_${new Date().toISOString().slice(0, 10)}.csv`;

  switch (metric) {
    case "volume": {
      const { data } = await supabase.rpc("crm_analytics_message_volume", rpcParams);
      const rows = (data ?? []).map((r: Record<string, unknown>) => ({
        date: r.date,
        chat_id: r.chat_id,
        message_count: r.message_count,
      }));
      csv = toCsv(["date", "chat_id", "message_count"], rows);
      break;
    }

    case "top_senders": {
      const { data } = await supabase.rpc("crm_analytics_top_senders", {
        ...rpcParams,
        p_limit: 500,
      });
      const rows = (data ?? []).map((r: Record<string, unknown>) => ({
        sender_id: r.sender_id,
        sender_name: r.sender_name ?? "Unknown",
        message_count: r.message_count,
      }));
      csv = toCsv(["sender_id", "sender_name", "message_count"], rows);
      break;
    }

    case "response_time": {
      const { data } = await supabase.rpc("crm_analytics_response_time", {
        ...rpcParams,
        p_limit: 500,
      });
      const rows = (data ?? []).map((r: Record<string, unknown>) => ({
        chat_id: r.chat_id,
        avg_response_ms: r.avg_response_ms,
        avg_response_minutes: r.avg_response_minutes,
        sample_size: r.sample_size,
      }));
      csv = toCsv(["chat_id", "avg_response_ms", "avg_response_minutes", "sample_size"], rows);
      break;
    }

    case "heatmap": {
      const { data } = await supabase.rpc("crm_analytics_heatmap", {
        ...rpcParams,
        p_timezone: timezone,
      });
      const rows = (data ?? []).map((r: Record<string, unknown>) => ({
        day_of_week: r.day_of_week,
        hour_of_day: r.hour_of_day,
        message_count: r.message_count,
      }));
      csv = toCsv(["day_of_week", "hour_of_day", "message_count"], rows);
      filename = `analytics_heatmap_${timezone.replace("/", "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown metric" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
