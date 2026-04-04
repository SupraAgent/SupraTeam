import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/messages/index/analytics — Aggregate analytics from indexed messages.
 * All aggregation is done server-side via Postgres RPCs for scalability.
 *
 * Query params:
 *   metric    — one of: volume, top_senders, response_time, heatmap
 *   chat_id   — optional chat filter
 *   after     — ISO date
 *   before    — ISO date
 *   limit     — results limit (default 20, max 100)
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  // Check indexing is enabled
  const { data: config } = await supabase
    .from("crm_message_index_config")
    .select("indexing_enabled")
    .eq("user_id", user.id)
    .single();

  if (!config?.indexing_enabled) {
    return NextResponse.json(
      { error: "Message indexing is not enabled. Enable it in Settings > Message Indexing." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric");
  const chatId = searchParams.get("chat_id");
  const after = searchParams.get("after");
  const before = searchParams.get("before");
  const rawLimit = Number(searchParams.get("limit") ?? 20);
  const limit = Math.min(isNaN(rawLimit) ? 20 : rawLimit, 100);

  if (!metric) {
    return NextResponse.json(
      { error: "metric parameter is required (volume, top_senders, response_time, heatmap)" },
      { status: 400 }
    );
  }

  const rpcParams = {
    p_user_id: user.id,
    p_chat_id: chatId ? Number(chatId) : null,
    p_after: after,
    p_before: before,
  };

  switch (metric) {
    case "volume": {
      const { data, error } = await supabase.rpc("crm_analytics_message_volume", rpcParams);

      if (error) {
        console.error("[api/messages/analytics] volume error:", error);
        return NextResponse.json({ error: "Failed to fetch volume analytics" }, { status: 500 });
      }

      // Group by date for client consumption
      const volumeMap = new Map<string, { chats: Record<string, number>; total: number }>();
      for (const row of data ?? []) {
        const day = row.date as string;
        if (!volumeMap.has(day)) volumeMap.set(day, { chats: {}, total: 0 });
        const entry = volumeMap.get(day)!;
        entry.chats[String(row.chat_id)] = Number(row.message_count);
        entry.total += Number(row.message_count);
      }

      const volumeData = Array.from(volumeMap.entries()).map(([date, v]) => ({
        date,
        chats: v.chats,
        total: v.total,
      }));

      return NextResponse.json({ data: volumeData, metric: "volume", source: "rpc" });
    }

    case "top_senders": {
      const { data, error } = await supabase.rpc("crm_analytics_top_senders", {
        ...rpcParams,
        p_limit: limit,
      });

      if (error) {
        console.error("[api/messages/analytics] top_senders error:", error);
        return NextResponse.json({ error: "Failed to fetch sender analytics" }, { status: 500 });
      }

      const sorted = (data ?? []).map((row: Record<string, unknown>) => ({
        sender_id: row.sender_id,
        sender_name: row.sender_name ?? "Unknown",
        count: Number(row.message_count),
      }));

      return NextResponse.json({ data: sorted, metric: "top_senders", source: "rpc" });
    }

    case "response_time": {
      const { data, error } = await supabase.rpc("crm_analytics_response_time", {
        ...rpcParams,
        p_limit: limit,
      });

      if (error) {
        console.error("[api/messages/analytics] response_time error:", error);
        return NextResponse.json({ error: "Failed to fetch response time analytics" }, { status: 500 });
      }

      return NextResponse.json({ data: data ?? [], metric: "response_time", source: "rpc" });
    }

    case "heatmap": {
      const { data, error } = await supabase.rpc("crm_analytics_heatmap", rpcParams);

      if (error) {
        console.error("[api/messages/analytics] heatmap error:", error);
        return NextResponse.json({ error: "Failed to fetch heatmap analytics" }, { status: 500 });
      }

      // Build heatmap grid for client
      const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      for (const row of data ?? []) {
        const dow = Number(row.day_of_week);
        const hour = Number(row.hour_of_day);
        if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) {
          heatmap[dow][hour] = Number(row.message_count);
        }
      }

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const heatmapData = heatmap.map((hours, dayIdx) => ({
        day: dayNames[dayIdx],
        day_index: dayIdx,
        hours,
        total: hours.reduce((a: number, b: number) => a + b, 0),
      }));

      return NextResponse.json({ data: heatmapData, metric: "heatmap", source: "rpc" });
    }

    default:
      return NextResponse.json(
        { error: `Unknown metric: ${metric}. Use: volume, top_senders, response_time, heatmap` },
        { status: 400 }
      );
  }
}
