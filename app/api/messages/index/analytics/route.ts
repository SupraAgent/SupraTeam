import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/messages/index/analytics — Aggregate analytics from indexed messages.
 *
 * Query params:
 *   metric    — one of: volume, top_senders, response_time, keywords, heatmap
 *   chat_id   — optional chat filter
 *   after     — ISO date
 *   before    — ISO date
 *   limit     — results limit (default 20)
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase, admin } = auth;

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
      { error: "metric parameter is required (volume, top_senders, response_time, keywords, heatmap)" },
      { status: 400 }
    );
  }

  // Build date filter clause for raw SQL
  const dateFilters: string[] = [`user_id = '${user.id}'`];
  if (chatId) dateFilters.push(`chat_id = ${Number(chatId)}`);
  if (after) dateFilters.push(`sent_at >= '${after}'`);
  if (before) dateFilters.push(`sent_at <= '${before}'`);
  const whereClause = dateFilters.join(" AND ");

  switch (metric) {
    case "volume": {
      // Message volume by chat over time (daily buckets)
      const { data, error } = await admin.rpc("crm_analytics_message_volume", {
        p_user_id: user.id,
        p_chat_id: chatId ? Number(chatId) : null,
        p_after: after,
        p_before: before,
      }).limit(limit);

      if (error) {
        // Fallback: simple query if RPC not available
        const { data: fallback, error: fbError } = await supabase
          .from("crm_message_index")
          .select("chat_id, sent_at")
          .eq("user_id", user.id)
          .order("sent_at", { ascending: false })
          .limit(1000);

        if (fbError) {
          console.error("[api/messages/analytics] volume error:", fbError);
          return NextResponse.json({ error: "Failed to fetch volume analytics" }, { status: 500 });
        }

        // Aggregate client-side as fallback
        const volumeMap = new Map<string, Map<string, number>>();
        for (const msg of fallback ?? []) {
          const day = msg.sent_at?.split("T")[0] ?? "unknown";
          const chatKey = String(msg.chat_id);
          if (!volumeMap.has(day)) volumeMap.set(day, new Map());
          const dayMap = volumeMap.get(day)!;
          dayMap.set(chatKey, (dayMap.get(chatKey) ?? 0) + 1);
        }

        const volumeData = Array.from(volumeMap.entries()).map(([day, chats]) => ({
          date: day,
          chats: Object.fromEntries(chats),
          total: Array.from(chats.values()).reduce((a, b) => a + b, 0),
        }));

        return NextResponse.json({ data: volumeData, metric: "volume", source: "computed" });
      }

      return NextResponse.json({ data, metric: "volume", source: "supabase" });
    }

    case "top_senders": {
      const { data, error } = await supabase
        .from("crm_message_index")
        .select("sender_id, sender_name")
        .eq("user_id", user.id)
        .not("sender_id", "is", null)
        .order("sent_at", { ascending: false })
        .limit(5000);

      if (error) {
        console.error("[api/messages/analytics] top_senders error:", error);
        return NextResponse.json({ error: "Failed to fetch sender analytics" }, { status: 500 });
      }

      // Aggregate sender counts
      const senderCounts = new Map<string, { sender_id: number; sender_name: string; count: number }>();
      for (const msg of data ?? []) {
        const key = String(msg.sender_id);
        const existing = senderCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          senderCounts.set(key, {
            sender_id: msg.sender_id,
            sender_name: msg.sender_name ?? "Unknown",
            count: 1,
          });
        }
      }

      const sorted = Array.from(senderCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return NextResponse.json({ data: sorted, metric: "top_senders", source: "computed" });
    }

    case "response_time": {
      // Average time between messages in each chat (simplified)
      const { data, error } = await supabase
        .from("crm_message_index")
        .select("chat_id, sent_at, sender_id")
        .eq("user_id", user.id)
        .order("sent_at", { ascending: true })
        .limit(5000);

      if (error) {
        console.error("[api/messages/analytics] response_time error:", error);
        return NextResponse.json({ error: "Failed to fetch response time analytics" }, { status: 500 });
      }

      // Group by chat and compute avg gap between different senders
      const chatMessages = new Map<string, Array<{ sent_at: string; sender_id: number | null }>>();
      for (const msg of data ?? []) {
        const key = String(msg.chat_id);
        if (!chatMessages.has(key)) chatMessages.set(key, []);
        chatMessages.get(key)!.push({ sent_at: msg.sent_at, sender_id: msg.sender_id });
      }

      const responseData = Array.from(chatMessages.entries()).map(([chatId, msgs]) => {
        const gaps: number[] = [];
        for (let i = 1; i < msgs.length; i++) {
          if (msgs[i].sender_id !== msgs[i - 1].sender_id) {
            const gap = new Date(msgs[i].sent_at).getTime() - new Date(msgs[i - 1].sent_at).getTime();
            if (gap > 0 && gap < 86400000) { // Ignore gaps > 24h
              gaps.push(gap);
            }
          }
        }
        const avgMs = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
        return {
          chat_id: Number(chatId),
          avg_response_ms: avgMs ? Math.round(avgMs) : null,
          avg_response_minutes: avgMs ? Math.round(avgMs / 60000) : null,
          sample_size: gaps.length,
        };
      }).filter((r) => r.avg_response_ms !== null)
        .sort((a, b) => (a.avg_response_ms ?? 0) - (b.avg_response_ms ?? 0))
        .slice(0, limit);

      return NextResponse.json({ data: responseData, metric: "response_time", source: "computed" });
    }

    case "keywords": {
      // Keyword frequency from message text (requires decryption, so limited)
      // For now, return top terms from search_vector stats
      const { data, error } = await supabase
        .from("crm_message_index")
        .select("message_text")
        .eq("user_id", user.id)
        .not("message_text", "is", null)
        .order("sent_at", { ascending: false })
        .limit(2000);

      if (error) {
        console.error("[api/messages/analytics] keywords error:", error);
        return NextResponse.json({ error: "Failed to fetch keyword analytics" }, { status: 500 });
      }

      // Note: message_text is encrypted. We work with what the DB can give us.
      // For keyword analytics, the full-text search vector is the primary tool.
      // This endpoint returns a count of messages with text as a baseline metric.
      return NextResponse.json({
        data: { total_messages_with_text: data?.length ?? 0 },
        metric: "keywords",
        note: "Keyword frequency requires client-side analysis due to encryption. Use the search endpoint for term matching.",
        source: "computed",
      });
    }

    case "heatmap": {
      // Activity heatmap by hour of day and day of week
      const { data, error } = await supabase
        .from("crm_message_index")
        .select("sent_at")
        .eq("user_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(10000);

      if (error) {
        console.error("[api/messages/analytics] heatmap error:", error);
        return NextResponse.json({ error: "Failed to fetch heatmap analytics" }, { status: 500 });
      }

      // Build heatmap: [day_of_week][hour] = count
      const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      for (const msg of data ?? []) {
        const d = new Date(msg.sent_at);
        heatmap[d.getUTCDay()][d.getUTCHours()]++;
      }

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const heatmapData = heatmap.map((hours, dayIdx) => ({
        day: dayNames[dayIdx],
        day_index: dayIdx,
        hours,
        total: hours.reduce((a: number, b: number) => a + b, 0),
      }));

      return NextResponse.json({ data: heatmapData, metric: "heatmap", source: "computed" });
    }

    default:
      return NextResponse.json(
        { error: `Unknown metric: ${metric}. Use: volume, top_senders, response_time, keywords, heatmap` },
        { status: 400 }
      );
  }
}
