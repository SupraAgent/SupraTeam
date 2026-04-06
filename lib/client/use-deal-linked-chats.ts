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
 * telegram_chat_id -> LinkedDealSummary for quick lookups in conversation lists.
 */
export function useDealLinkedChats() {
  const [linkedChats, setLinkedChats] = React.useState<
    Map<number, LinkedDealSummary>
  >(new Map());
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/deals/linked-chats-map");
      if (res.ok) {
        const data = await res.json();
        const map = new Map<number, LinkedDealSummary>();
        for (const entry of data.links ?? []) {
          map.set(Number(entry.telegram_chat_id), {
            deal_id: entry.deal_id,
            deal_name: entry.deal_name,
            stage_name: entry.stage_name,
            stage_color: entry.stage_color,
            board_type: entry.board_type,
          });
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
