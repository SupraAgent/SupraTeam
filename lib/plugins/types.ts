// ── Email Dashboard Plugin Types ────────────────────────────

import type { LucideIcon } from "lucide-react";

export interface DashboardPanel {
  id: PanelId;
  title: string;
  icon: LucideIcon;
  description: string;
  /** Grid size: "1x1" = 1 col, "2x1" = 2 cols, "full" = full width */
  size: "1x1" | "2x1" | "full";
  /** Default enabled state */
  defaultEnabled: boolean;
}

export type PanelId =
  | "contact-card"
  | "followup-tracker"
  | "ai-summary"
  | "deal-spotlight"
  | "email-tags"
  | "outreach-queue"
  | "metrics-strip"
  | "activity-feed"
  | "broadcast-composer";

export interface PanelLayoutState {
  enabledPanels: PanelId[];
}

export interface DashboardKeyboardHandlers {
  onToggleDashboard: () => void;
  onRefresh: () => void;
}
