"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useDashboardLayout, useEmailDashboardKeys } from "@/lib/plugins/hooks";
import { getPanelById, PANELS } from "@/lib/plugins/registry";
import { PanelCard } from "@/components/email/dashboard/panel-card";
import { PanelPicker } from "@/components/email/dashboard/panel-picker";
import { PlaceholderPanel } from "@/components/email/dashboard/placeholder-panel";
import { ContactCardPanel } from "@/components/email/dashboard/contact-card-panel";
import { FollowupTrackerPanel } from "@/components/email/dashboard/followup-tracker-panel";
import { AISummaryPanel } from "@/components/email/dashboard/ai-summary-panel";
import { DealSpotlightPanel } from "@/components/email/dashboard/deal-spotlight-panel";
import { Mail, LayoutDashboard, Plus, ArrowLeft } from "lucide-react";
import type { PanelId } from "@/lib/plugins/types";

export default function EmailDashboardPage() {
  const { layout, togglePanel, resetLayout } = useDashboardLayout();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const keyHandlers = React.useMemo(() => ({
    onToggleDashboard: () => {},
    onRefresh: () => setRefreshKey((k) => k + 1),
  }), []);

  useEmailDashboardKeys(keyHandlers, !pickerOpen);

  const [selectedEmail, setSelectedEmail] = React.useState<string | null>(null);
  const [selectedSenderName, setSelectedSenderName] = React.useState<string | undefined>();
  const [threadMessages, setThreadMessages] = React.useState<{ from: string; date: string; body: string }[] | null>(null);
  const [threadSubject, setThreadSubject] = React.useState<string | undefined>();
  const [linkedDealId, setLinkedDealId] = React.useState<string | null>(null);

  const enabledPanels = layout.enabledPanels;

  function renderPanel(panelId: PanelId) {
    switch (panelId) {
      case "contact-card":
        return <ContactCardPanel email={selectedEmail} senderName={selectedSenderName} />;
      case "followup-tracker":
        return <FollowupTrackerPanel />;
      case "ai-summary":
        return <AISummaryPanel messages={threadMessages} subject={threadSubject} dealId={linkedDealId} />;
      case "deal-spotlight":
        return <DealSpotlightPanel />;
      default:
        return <PlaceholderPanel panelId={panelId} />;
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
            <span>email</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" key={refreshKey}>
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
