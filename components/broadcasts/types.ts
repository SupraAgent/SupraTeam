export interface TgGroup {
  id: string;
  group_name: string;
  telegram_group_id: string;
  bot_is_admin: boolean;
  member_count: number | null;
  slugs: string[];
}

export interface BroadcastResult {
  group_name: string;
  success: boolean;
  error?: string;
}

export interface BroadcastRecipient {
  id: string;
  group_name: string;
  status: string;
  error: string | null;
  sent_at: string | null;
}

export interface Broadcast {
  id: string;
  message_text: string;
  sender_name: string | null;
  slug_filter: string | null;
  group_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  recipients: BroadcastRecipient[];
}

export interface AbResult {
  broadcast_id: string;
  message_preview: string;
  variant_a: { sent: number; responded: number; rate: number };
  variant_b: { sent: number; responded: number; rate: number };
}

export interface AnalyticsData {
  overview: {
    totalBroadcasts: number;
    totalSent: number;
    totalFailed: number;
    deliveryRate: number;
    thisWeek: number;
    lastWeek: number;
    weeklyChange: number;
  };
  byStatus: Record<string, number>;
  slugStats: { slug: string; count: number; sent: number; failed: number; deliveryRate: number }[];
  senderStats: { name: string; count: number }[];
  dailyVolume: { date: string; count: number }[];
  abResults?: AbResult[];
  bestSendTime?: { hour: number; sent: number; responded: number; responseRate: number }[];
}

export interface BotTemplate {
  id: string;
  template_key: string;
  name: string;
  body_template: string;
  category: string | null;
}
