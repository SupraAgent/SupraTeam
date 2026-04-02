// ── Panel Registry ──────────────────────────────────────────

import {
  User,
  Clock,
  Sparkles,
  Target,
  Send,
  BarChart3,
  Activity,
  Radio,
  Calendar,
} from "lucide-react";
import type { DashboardPanel, PanelId } from "./types";
import { ContactCardPanel } from "@/components/email/dashboard/contact-card-panel";
import { FollowupTrackerPanel } from "@/components/email/dashboard/followup-tracker-panel";
import { AISummaryPanel } from "@/components/email/dashboard/ai-summary-panel";
import { DealSpotlightPanel } from "@/components/email/dashboard/deal-spotlight-panel";
import { OutreachQueuePanel } from "@/components/email/dashboard/outreach-queue-panel";
import { MetricsStripPanel } from "@/components/email/dashboard/metrics-strip-panel";
import { ActivityFeedPanel } from "@/components/email/dashboard/activity-feed-panel";
import { BroadcastComposerPanel } from "@/components/email/dashboard/broadcast-composer-panel";
import { CalendarPanel } from "@/components/email/dashboard/calendar-panel";
import { CalendarViewPanel } from "@/components/email/dashboard/calendar-view-panel";

export const PANELS: DashboardPanel[] = [
  {
    id: "metrics-strip",
    title: "Metrics",
    icon: BarChart3,
    description: "Emails sent/received, response rate, avg reply time",
    size: "full",
    defaultEnabled: true,
    component: MetricsStripPanel,
  },
  {
    id: "deal-spotlight",
    title: "Deal Spotlight",
    icon: Target,
    description: "Emails linked to active deals, color-coded by stage",
    size: "2x1",
    defaultEnabled: true,
    component: DealSpotlightPanel,
  },
  {
    id: "followup-tracker",
    title: "Follow-ups",
    icon: Clock,
    description: "Emails awaiting reply, grouped by age",
    size: "2x1",
    defaultEnabled: true,
    component: FollowupTrackerPanel,
  },
  {
    id: "contact-card",
    title: "Contact Card",
    icon: User,
    description: "CRM profile for selected sender",
    size: "1x1",
    defaultEnabled: false,
    component: ContactCardPanel,
  },
  {
    id: "outreach-queue",
    title: "Outreach Queue",
    icon: Send,
    description: "Today's scheduled outreach sequence steps",
    size: "1x1",
    defaultEnabled: true,
    component: OutreachQueuePanel,
  },
  {
    id: "ai-summary",
    title: "AI Summary & Tags",
    icon: Sparkles,
    description: "Claude-generated thread summaries with action items and tags",
    size: "2x1",
    defaultEnabled: false,
    component: AISummaryPanel,
  },
  {
    id: "activity-feed",
    title: "Activity Feed",
    icon: Activity,
    description: "Cross-channel feed: emails, deals, TG messages",
    size: "1x1",
    defaultEnabled: true,
    component: ActivityFeedPanel,
  },
  {
    id: "broadcast-composer",
    title: "Broadcast",
    icon: Radio,
    description: "Draft and send broadcasts to slug-tagged groups",
    size: "full",
    defaultEnabled: false,
    component: BroadcastComposerPanel,
  },
  {
    id: "calendar",
    title: "Calendar",
    icon: Calendar,
    description: "Upcoming Google Calendar events and meetings",
    size: "full",
    defaultEnabled: false,
    component: CalendarPanel,
  },
  {
    id: "calendar-view",
    title: "Calendar View",
    icon: Calendar,
    description: "Full month/week calendar grid with events",
    size: "full",
    defaultEnabled: true,
    component: CalendarViewPanel,
  },
];

export function getPanelById(id: PanelId): DashboardPanel | undefined {
  return PANELS.find((p) => p.id === id);
}

export function getDefaultLayout(): PanelId[] {
  return PANELS.filter((p) => p.defaultEnabled).map((p) => p.id);
}
