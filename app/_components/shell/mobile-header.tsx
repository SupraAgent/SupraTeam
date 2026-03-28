"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Menu, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { TOP_ITEMS, NAV_SECTIONS, BOTTOM_ITEMS, ADMIN_ITEM } from "./nav-config";
import { useCollapsedSections } from "./use-collapsed-sections";

export function MobileHeader() {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen, crmRole } = useShell();
  const sections = useCollapsedSections();

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
                  aria-expanded={isOpen}
                >
                  <ChevronRight className={cn("h-3 w-3 mr-1.5 shrink-0 transition-transform", isOpen && "rotate-90")} />
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
              <Link href={ADMIN_ITEM.href} onClick={() => setMobileNavOpen(false)} className={linkClass(ADMIN_ITEM.href)}>
                {ADMIN_ITEM.label}
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
