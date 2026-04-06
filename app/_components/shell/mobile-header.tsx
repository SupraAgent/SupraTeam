"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ALL_NAV_ITEMS, ADMIN_ITEM, filterNav } from "./nav-config";
import { Search, Menu, X } from "lucide-react";

export function MobileHeader() {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen, crmRole, onboardingState, showAllNav } = useShell();

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-primary/20 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-primary" />
          </div>
          <span className="text-sm font-semibold">SupraTeam</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <NotificationCenter />
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileNavOpen && (
        <nav className="border-b border-white/10 bg-background px-4 py-2 space-y-0.5 animate-fade-in">
          {filterNav(ALL_NAV_ITEMS, crmRole, onboardingState, showAllNav).map((item) => {
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
