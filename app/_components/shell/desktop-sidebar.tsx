"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useShell } from "./shell-context";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
  { href: "/tasks", label: "Tasks", icon: TasksIcon },
  { href: "/email", label: "Email", icon: MailIcon },
  { href: "/contacts", label: "Contacts", icon: UsersIcon },
  { href: "/groups", label: "TG Groups", icon: MessageCircleIcon },
  { href: "/conversations", label: "Conversations", icon: ChatBubblesIcon },
  { href: "/broadcasts", label: "Broadcasts", icon: MegaphoneIcon },
  { href: "/outreach", label: "Outreach", icon: OutreachIcon },
  { href: "/automations", label: "Automations", icon: WorkflowIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/reports", label: "Reports", icon: ChartIcon },
  { href: "/access", label: "Access Control", icon: ShieldIcon },
  { href: "/graph", label: "Graph", icon: NetworkIcon },
  { href: "/docs", label: "Docs", icon: FileTextIcon },
] as const;

const SETTINGS_ITEMS = [
  { href: "/settings", label: "General" },
  { href: "/settings/pipeline", label: "Pipeline" },
  { href: "/settings/contacts", label: "Contacts" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/telegram", label: "Telegram" },
  { href: "/settings/email", label: "Email" },
  { href: "/settings/sequences", label: "Sequences" },
  { href: "/settings/telegram-connect", label: "TG Connect" },
  { href: "/settings/templates", label: "Bot Templates" },
  { href: "/settings/ai-agent", label: "AI Agent" },
  { href: "/settings/automations", label: "Automations" },
  { href: "/settings/webhooks", label: "Webhooks" },
  { href: "/settings/privacy", label: "Privacy & GDPR" },
  { href: "/settings/notifications", label: "Notification Log" },
] as const;

export function DesktopSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { sidebarCollapsed, setSidebarCollapsed } = useShell();

  return (
    <aside className={cn(
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
          {!sidebarCollapsed && <span className="text-sm font-semibold text-foreground">SupraCRM</span>}
        </div>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <CollapseIcon className="h-4 w-4" collapsed={sidebarCollapsed} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto thin-scroll">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={sidebarCollapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg py-2 text-[13px] font-medium transition-colors",
                sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-2.5",
                active
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && item.label}
            </Link>
          );
        })}

        {/* Settings section */}
        {!sidebarCollapsed && (
          <div className="pt-4 pb-1 px-2.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Settings
            </span>
          </div>
        )}
        {sidebarCollapsed && <div className="pt-2 border-t border-white/10 mt-2" />}
        {SETTINGS_ITEMS.map((item) => {
          const active = item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={sidebarCollapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg py-2 text-[13px] font-medium transition-colors",
                sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-2.5",
                active
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              <SettingsIcon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && item.label}
            </Link>
          );
        })}
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
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOutIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className={cn(
              "flex items-center justify-center rounded-xl bg-[#2AABEE] text-white text-xs font-medium transition hover:bg-[#2AABEE]/90 w-full",
              sidebarCollapsed ? "p-2" : "gap-2 px-3 py-2.5"
            )}
            title={sidebarCollapsed ? "Sign in with Telegram" : undefined}
          >
            <TelegramIcon className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && "Sign in with Telegram"}
          </Link>
        )}
      </div>
    </aside>
  );
}

// Inline SVG icons (no external dependency)

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function KanbanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="12" rx="1" />
      <rect x="17" y="3" width="5" height="15" rx="1" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function MessageCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function CollapseIcon({ className, collapsed }: { className?: string; collapsed: boolean }) {
  if (collapsed) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 17l5-5-5-5" />
        <path d="M6 17l5-5-5-5" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 7l-5 5 5 5" />
      <path d="M18 7l-5 5 5 5" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function NetworkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3" />
      <circle cx="5" cy="19" r="3" />
      <circle cx="19" cy="19" r="3" />
      <line x1="12" y1="8" x2="5" y2="16" />
      <line x1="12" y1="8" x2="19" y2="16" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22 6 12 13 2 6" />
    </svg>
  );
}

function ChatBubblesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function TasksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function OutreachIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22l-4-9-9-4z" />
    </svg>
  );
}

function WorkflowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <path d="M6 9v3a3 3 0 003 3h6" />
      <path d="M15 15l-3-3" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
