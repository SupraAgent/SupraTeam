"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SETTINGS_GROUPS = [
  {
    label: "General",
    items: [
      { href: "/settings", label: "General" },
      { href: "/settings/pipeline", label: "Pipeline" },
      { href: "/settings/contacts", label: "Contacts" },
      { href: "/settings/privacy", label: "Privacy & GDPR" },
    ],
  },
  {
    label: "Telegram",
    items: [
      { href: "/settings/telegram", label: "Telegram Bots" },
      { href: "/settings/telegram-connect", label: "TG Connect" },
      { href: "/settings/templates", label: "Bot Templates" },
    ],
  },
  {
    label: "Outreach",
    items: [
      { href: "/settings/email", label: "Email" },
      { href: "/settings/sequences", label: "Sequences" },
    ],
  },
  {
    label: "Automation & AI",
    items: [
      { href: "/settings/automations", label: "Automations" },
      { href: "/settings/ai-agent", label: "AI Agent" },
      { href: "/settings/webhooks", label: "Webhooks" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings/notifications", label: "Notification Log" },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-6 min-h-0">
      {/* In-page side nav */}
      <nav className="hidden md:block w-48 shrink-0">
        <div className="sticky top-6 space-y-4">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 px-2 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.href === "/settings"
                    ? pathname === "/settings"
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "block rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white/10 text-foreground"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Mobile: horizontal scroll tabs */}
      <div className="md:hidden w-full overflow-x-auto pb-3 -mt-2">
        <div className="flex gap-1 min-w-max px-1">
          {SETTINGS_GROUPS.flatMap((g) => g.items).map((item) => {
            const active = item.href === "/settings"
              ? pathname === "/settings"
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:bg-white/5"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
