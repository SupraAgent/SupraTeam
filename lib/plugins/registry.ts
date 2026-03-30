// ── Panel Registry ──────────────────────────────────────────

import {
  User,
  Clock,
  Sparkles,
  Target,
  Tag,
  Send,
  BarChart3,
  Activity,
  Radio,
} from "lucide-react";
import type { DashboardPanel, PanelId } from "./types";

export const PANELS: DashboardPanel[] = [
  {
    id: "metrics-strip",
    title: "Metrics",
    icon: BarChart3,
    description: "Emails sent/received, response rate, avg reply time",
    size: "full",
    defaultEnabled: true,
  },
  {
    id: "deal-spotlight",
    title: "Deal Spotlight",
    icon: Target,
    description: "Emails linked to active deals, color-coded by stage",
    size: "2x1",
    defaultEnabled: true,
  },
  {
    id: "followup-tracker",
    title: "Follow-ups",
    icon: Clock,
    description: "Emails awaiting reply, grouped by age",
    size: "2x1",
    defaultEnabled: true,
  },
  {
    id: "contact-card",
    title: "Contact Card",
    icon: User,
    description: "CRM profile for selected sender",
    size: "1x1",
    defaultEnabled: true,
  },
  {
    id: "outreach-queue",
    title: "Outreach Queue",
    icon: Send,
    description: "Today's scheduled outreach sequence steps",
    size: "1x1",
    defaultEnabled: true,
  },
  {
    id: "ai-summary",
    title: "AI Summary",
    icon: Sparkles,
    description: "Claude-generated thread summaries with action items",
    size: "2x1",
    defaultEnabled: true,
  },
  {
    id: "email-tags",
    title: "Tags",
    icon: Tag,
    description: "Auto and manual email thread tags",
    size: "1x1",
    defaultEnabled: true,
  },
  {
    id: "activity-feed",
    title: "Activity Feed",
    icon: Activity,
    description: "Cross-channel feed: emails, deals, TG messages",
    size: "1x1",
    defaultEnabled: true,
  },
  {
    id: "broadcast-composer",
    title: "Broadcast",
    icon: Radio,
    description: "Draft and send broadcasts to slug-tagged groups",
    size: "full",
    defaultEnabled: false,
  },
];

export function getPanelById(id: PanelId): DashboardPanel | undefined {
  return PANELS.find((p) => p.id === id);
}

export function getDefaultLayout(): PanelId[] {
  return PANELS.filter((p) => p.defaultEnabled).map((p) => p.id);
}
