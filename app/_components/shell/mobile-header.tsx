"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";
import { NotificationCenter } from "@/components/notifications/notification-center";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/tasks", label: "Tasks" },
  { href: "/email", label: "Email" },
  { href: "/contacts", label: "Contacts" },
  { href: "/groups", label: "Groups" },
  { href: "/broadcasts", label: "Broadcasts" },
  { href: "/outreach", label: "Outreach" },
  { href: "/automations", label: "Automations" },
  { href: "/access", label: "Access Control" },
  { href: "/graph", label: "Graph" },
  { href: "/docs", label: "Docs" },
  { href: "/settings", label: "Settings" },
] as const;

const ADMIN_ITEM = { href: "/admin", label: "Admin" } as const;

export function MobileHeader() {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen, crmRole } = useShell();

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
        <nav className="border-b border-white/10 bg-background px-4 py-2 space-y-0.5 animate-fade-in">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
          {crmRole === "admin_lead" && (
            <Link
              href={ADMIN_ITEM.href}
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              {ADMIN_ITEM.label}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
