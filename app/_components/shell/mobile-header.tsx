"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";
import { NotificationCenter } from "@/components/notifications/notification-center";

// --- Navigation structure (mirrors desktop sidebar groupings) ---

interface MobileNavItem {
  href: string;
  label: string;
}

interface MobileNavSection {
  key: string;
  label: string;
  items: MobileNavItem[];
}

const TOP_ITEMS: MobileNavItem[] = [
  { href: "/", label: "Home" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/inbox", label: "Inbox" },
  { href: "/contacts", label: "Contacts" },
];

const NAV_SECTIONS: MobileNavSection[] = [
  {
    key: "messaging",
    label: "Messaging",
    items: [
      { href: "/broadcasts", label: "Broadcasts" },
      { href: "/email", label: "Email" },
      { href: "/outreach", label: "Outreach" },
    ],
  },
  {
    key: "automation",
    label: "Automation",
    items: [
      { href: "/automations", label: "Automations" },
      { href: "/loop", label: "Loop Builder" },
      { href: "/drip", label: "Drip Sequences" },
      { href: "/tasks", label: "Tasks" },
    ],
  },
  {
    key: "telegram",
    label: "Telegram",
    items: [
      { href: "/groups", label: "TG Groups" },
      { href: "/access", label: "Access Control" },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports" },
      { href: "/graph", label: "Graph" },
      { href: "/calendar", label: "Calendar" },
    ],
  },
];

const BOTTOM_ITEMS: MobileNavItem[] = [
  { href: "/docs", label: "Docs" },
  { href: "/suggestions", label: "Suggestions" },
  { href: "/settings", label: "Settings" },
];

const STORAGE_KEY = "supracrm-nav-sections";

function useMobileSections() {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCollapsed(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const toggle = React.useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

export function MobileHeader() {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen, crmRole } = useShell();
  const sections = useMobileSections();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkClass = (href: string) =>
    cn(
      "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      isActive(href)
        ? "bg-white/10 text-foreground"
        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
    );

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-primary/20 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-primary" />
          </div>
          <span className="text-sm font-semibold">SupraCRM</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Search button */}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
          {/* Notifications */}
          <NotificationCenter />
          {/* Hamburger */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              {mobileNavOpen ? (
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileNavOpen && (
        <nav className="border-b border-white/10 bg-background px-4 py-2 animate-fade-in">
          {/* Top items */}
          <div className="space-y-0.5">
            {TOP_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={linkClass(item.href)}>
                {item.label}
              </Link>
            ))}
          </div>

          {/* Collapsible sections */}
          {NAV_SECTIONS.map((section) => {
            const isOpen = !sections.collapsed[section.key];
            const hasActive = section.items.some((i) => isActive(i.href));

            return (
              <div key={section.key} className="mt-2">
                <button
                  onClick={() => sections.toggle(section.key)}
                  className={cn(
                    "flex items-center w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                    hasActive && !isOpen
                      ? "text-primary"
                      : "text-muted-foreground/60"
                  )}
                >
                  <svg
                    className={cn("h-3 w-3 mr-1.5 shrink-0 transition-transform", isOpen ? "rotate-90" : "rotate-0")}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  {section.label}
                </button>
                {isOpen && (
                  <div className="space-y-0.5 mt-0.5">
                    {section.items.map((item) => (
                      <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={linkClass(item.href)}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Bottom items */}
          <div className="mt-2 pt-2 border-t border-white/5 space-y-0.5">
            {BOTTOM_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={linkClass(item.href)}>
                {item.label}
              </Link>
            ))}
            {crmRole === "admin_lead" && (
              <Link href="/admin" onClick={() => setMobileNavOpen(false)} className={linkClass("/admin")}>
                Admin
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
