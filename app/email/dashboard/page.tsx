"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDashboardLayout, useEmailDashboardKeys } from "@/lib/plugins/hooks";
import { getPanelById } from "@/lib/plugins/registry";
import { PanelCard } from "@/components/email/dashboard/panel-card";
import { PanelPicker } from "@/components/email/dashboard/panel-picker";
import { ContactCardPanel } from "@/components/email/dashboard/contact-card-panel";
import { FollowupTrackerPanel } from "@/components/email/dashboard/followup-tracker-panel";
import { AISummaryPanel } from "@/components/email/dashboard/ai-summary-panel";
import { DealSpotlightPanel } from "@/components/email/dashboard/deal-spotlight-panel";
import { EmailTagsPanel } from "@/components/email/dashboard/email-tags-panel";
import { OutreachQueuePanel } from "@/components/email/dashboard/outreach-queue-panel";
import { MetricsStripPanel } from "@/components/email/dashboard/metrics-strip-panel";
import { ActivityFeedPanel } from "@/components/email/dashboard/activity-feed-panel";
import { BroadcastComposerPanel } from "@/components/email/dashboard/broadcast-composer-panel";
import { Mail, LayoutDashboard, Plus, ArrowLeft } from "lucide-react";
import type { PanelId } from "@/lib/plugins/types";

/** Combined state for the currently selected thread context */
interface ThreadContext {
  email: string | null;
  senderName?: string;
  threadId: string | null;
  messages: { from: string; date: string; body: string }[] | null;
  subject?: string;
  dealId: string | null;
}

const EMPTY_CONTEXT: ThreadContext = {
  email: null,
  threadId: null,
  messages: null,
  dealId: null,
};

export default function EmailDashboardPage() {
  const router = useRouter();
  const { layout, togglePanel, resetLayout } = useDashboardLayout();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [ctx, setCtx] = React.useState<ThreadContext>(EMPTY_CONTEXT);

  // Refresh counter — passed to panels so `r` key triggers re-fetch
  const [refreshKey, setRefreshKey] = React.useState(0);

  const keyHandlers = React.useMemo(() => ({
    onToggleDashboard: () => router.push("/email"),
    onRefresh: () => setRefreshKey((k) => k + 1),
  }), [router]);

  useEmailDashboardKeys(keyHandlers, !pickerOpen);

  const enabledPanels = layout.enabledPanels;

  /** Called by Deal Spotlight or Follow-up Tracker when a thread is clicked */
  function handleSelectThread(threadId: string, email?: string, senderName?: string) {
    setCtx((prev) => ({
      ...prev,
      threadId,
      email: email ?? prev.email,
      senderName: senderName ?? prev.senderName,
    }));
  }

  /** Called by Deal Spotlight when a deal-linked thread is clicked */
  function handleSelectDealThread(threadId: string, dealId: string, email?: string) {
    setCtx((prev) => ({
      ...prev,
      threadId,
      dealId,
      email: email ?? prev.email,
    }));
  }

  function renderPanel(panelId: PanelId) {
    switch (panelId) {
      case "contact-card":
        return <ContactCardPanel email={ctx.email} senderName={ctx.senderName} />;
      case "followup-tracker":
        return <FollowupTrackerPanel key={refreshKey} onSelectThread={(id) => handleSelectThread(id)} />;
      case "ai-summary":
        return <AISummaryPanel messages={ctx.messages} subject={ctx.subject} dealId={ctx.dealId} />;
      case "deal-spotlight":
        return <DealSpotlightPanel key={refreshKey} onSelectThread={(id) => handleSelectThread(id)} />;
      case "email-tags":
        return <EmailTagsPanel threadId={ctx.threadId} />;
      case "outreach-queue":
        return <OutreachQueuePanel key={refreshKey} />;
      case "metrics-strip":
        return <MetricsStripPanel key={refreshKey} />;
      case "activity-feed":
        return <ActivityFeedPanel key={refreshKey} />;
      case "broadcast-composer":
        return <BroadcastComposerPanel />;
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/email"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <Mail className="h-4 w-4" />
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold text-foreground">Email Dashboard</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/10 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Panels
          </button>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">d</kbd>
            <span>back</span>
            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 ml-1">r</kbd>
            <span>refresh</span>
          </div>
        </div>
      </div>

      {/* Dashboard grid */}
      <div className="flex-1 overflow-y-auto p-4 thin-scroll">
        {enabledPanels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <LayoutDashboard className="h-12 w-12 opacity-20" />
            <p className="text-sm">No panels enabled</p>
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium bg-primary text-white hover:bg-primary/90 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Panels
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {enabledPanels.map((panelId) => {
              const panel = getPanelById(panelId);
              if (!panel) return null;
              return (
                <PanelCard
                  key={panelId}
                  panel={panel}
                  onRemove={() => togglePanel(panelId)}
                >
                  {renderPanel(panelId)}
                </PanelCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Panel picker */}
      <PanelPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        enabledPanels={enabledPanels}
        onToggle={togglePanel}
        onReset={resetLayout}
      />
    </div>
  );
}
