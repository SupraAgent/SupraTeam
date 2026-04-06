import * as React from "react";

export interface LinkedDealSummary {
  deal_id: string;
  deal_name: string;
  stage_name: string | null;
  stage_color: string | null;
  board_type: string | null;
}

/**
 * Fetches all deal-linked Telegram chat IDs and returns a map of
 * telegram_chat_id (string) -> LinkedDealSummary[] for quick lookups.
 * Uses string keys because Supabase returns bigints as strings and
 * Number() would lose precision for IDs > 2^53.
 */
export function useDealLinkedChats() {
  const [linkedChats, setLinkedChats] = React.useState<
    Map<string, LinkedDealSummary[]>
  >(new Map());
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/deals/linked-chats-map");
      if (res.ok) {
        const data = await res.json();
        const map = new Map<string, LinkedDealSummary[]>();
        for (const entry of data.links ?? []) {
          const key = String(entry.telegram_chat_id);
          const summary: LinkedDealSummary = {
            deal_id: entry.deal_id,
            deal_name: entry.deal_name,
            stage_name: entry.stage_name,
            stage_color: entry.stage_color,
            board_type: entry.board_type,
          };
          const existing = map.get(key);
          if (existing) {
            existing.push(summary);
          } else {
            map.set(key, [summary]);
          }
        }
        setLinkedChats(map);
      }
    } catch {
      // Non-critical — just won't show badges
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return { linkedChats, loading, refresh };
}
