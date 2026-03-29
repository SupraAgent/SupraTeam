"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useShell } from "./shell-context";
import { TOP_ITEMS, NAV_SECTIONS, SETTINGS_ITEM, ADMIN_ITEM, type NavItem } from "./nav-config";
import { useCollapsedSections } from "./use-collapsed-sections";
import { ChevronsLeft, ChevronsRight, LogOut, ChevronDown, ChevronRight } from "lucide-react";

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

const NavLink = React.memo(function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      className={cn(
        "flex items-center rounded-lg py-2 text-[13px] font-medium transition-colors",
        collapsed ? "justify-center px-2" : "gap-2.5 px-2.5",
        active
          ? "bg-white/10 text-foreground"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed && item.label}
    </Link>
  );
});

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function DesktopSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { sidebarCollapsed, setSidebarCollapsed, crmRole } = useShell();
  const { collapsed: collapsedSections, toggle: toggleSection } = useCollapsedSections();

  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-white/10 bg-white/[0.02] transition-all duration-200",
        sidebarCollapsed ? "md:w-14" : "md:w-56"
      )}
      style={{ backgroundColor: "hsl(var(--surface-1))" }}
    >
      {/* Logo + collapse toggle */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
          </div>
          {!sidebarCollapsed && <span className="text-sm font-semibold text-foreground">SupraTeam</span>}
        </div>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto thin-scroll">
        {/* Top items (no section header) */}
        {TOP_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href, pathname)} collapsed={sidebarCollapsed} />
        ))}

        {/* Collapsible sections */}
        {NAV_SECTIONS.map((section) => {
          const isCollapsed = collapsedSections.has(section.key);
          return (
            <div key={section.key} className="pt-3">
              {!sidebarCollapsed && (
                <button
                  onClick={() => toggleSection(section.key)}
                  className="flex items-center gap-1 px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors w-full"
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${section.label}`}
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {section.label}
                </button>
              )}
              {(!isCollapsed || sidebarCollapsed) &&
                section.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href, pathname)} collapsed={sidebarCollapsed} />
                ))}
            </div>
          );
        })}

        {/* Settings */}
        <div className="pt-3">
          <NavLink item={SETTINGS_ITEM} active={isActive(SETTINGS_ITEM.href, pathname)} collapsed={sidebarCollapsed} />
        </div>

        {/* Admin link (only for admin_lead) */}
        {crmRole === "admin_lead" && (
          <NavLink item={ADMIN_ITEM} active={isActive(ADMIN_ITEM.href, pathname)} collapsed={sidebarCollapsed} />
        )}
      </nav>

      {/* User or Login */}
      <div className="border-t border-white/10 p-3">
        {user ? (
          <div className="flex items-center gap-2">
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="h-7 w-7 rounded-full"
              />
            )}
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email}
                </p>
                {user.user_metadata?.telegram_username && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    @{user.user_metadata.telegram_username}
                  </p>
                )}
              </div>
            )}
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className={cn(
              "flex items-center justify-center rounded-xl bg-[#2AABEE] text-white text-xs font-medium transition hover:bg-[#2AABEE]/90 w-full",
              sidebarCollapsed ? "p-2" : "gap-2 px-3 py-2.5"
            )}
            aria-label="Sign in with Telegram"
          >
            <TelegramIcon className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && "Sign in with Telegram"}
          </Link>
        )}
      </div>
    </aside>
  );
}
