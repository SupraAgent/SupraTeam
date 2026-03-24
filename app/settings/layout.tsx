"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SETTINGS_GROUPS = [
  {
    label: "General",
    href: "/settings",
    match: (p: string) => p === "/settings" || p.startsWith("/settings/team"),
    tabs: [
      { label: "Profile", href: "/settings" },
      { label: "Team", href: "/settings/team" },
    ],
  },
  {
    label: "Integrations",
    href: "/settings/integrations",
    match: (p: string) => p.startsWith("/settings/integrations"),
    tabs: [
      { label: "Telegram Bots", href: "/settings/integrations" },
      { label: "TG Connect", href: "/settings/integrations/connect" },
      { label: "Email", href: "/settings/integrations/email" },
      { label: "Webhooks", href: "/settings/integrations/webhooks" },
    ],
  },
  {
    label: "Pipeline",
    href: "/settings/pipeline",
    match: (p: string) => p.startsWith("/settings/pipeline"),
    tabs: [
      { label: "Stages & Fields", href: "/settings/pipeline" },
      { label: "Contact Fields", href: "/settings/pipeline/contacts" },
    ],
  },
  {
    label: "Automation",
    href: "/settings/automations",
    match: (p: string) => p.startsWith("/settings/automations"),
    tabs: [
      { label: "Rules", href: "/settings/automations" },
      { label: "Sequences", href: "/settings/automations/sequences" },
      { label: "Bot Templates", href: "/settings/automations/templates" },
    ],
  },
  {
    label: "AI Agent",
    href: "/settings/ai-agent",
    match: (p: string) => p.startsWith("/settings/ai-agent"),
    tabs: [],
  },
  {
    label: "Compliance",
    href: "/settings/privacy",
    match: (p: string) => p.startsWith("/settings/privacy"),
    tabs: [
      { label: "Privacy & GDPR", href: "/settings/privacy" },
      { label: "Notifications", href: "/settings/privacy/notifications" },
      { label: "Audit Log", href: "/settings/privacy/audit" },
    ],
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeGroup = SETTINGS_GROUPS.find((g) => g.match(pathname));

  return (
    <div className="space-y-0">
      {/* Group tabs */}
      <div className="border-b border-white/10 overflow-x-auto thin-scroll">
        <nav className="flex gap-1 px-1 min-w-max">
          {SETTINGS_GROUPS.map((group) => {
            const active = group.match(pathname);
            return (
              <Link
                key={group.href}
                href={group.href}
                className={cn(
                  "px-3 py-2.5 text-[13px] font-medium transition-colors whitespace-nowrap border-b-2",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {group.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sub-tabs (if group has multiple pages) */}
      {activeGroup && activeGroup.tabs.length > 1 && (
        <div className="border-b border-white/5 overflow-x-auto thin-scroll">
          <nav className="flex gap-1 px-1 min-w-max">
            {activeGroup.tabs.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2",
                    active
                      ? "border-primary/60 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Page content */}
      <div className="py-6">{children}</div>
    </div>
  );
}
