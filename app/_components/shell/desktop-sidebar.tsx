"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useShell } from "./shell-context";

// --- Navigation structure with sections ---

interface NavItem {
  href: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}

interface NavSection {
  key: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  items: NavItem[];
}

const TOP_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/contacts", label: "Contacts", icon: UsersIcon },
];

const NAV_SECTIONS: NavSection[] = [
  {
    key: "messaging",
    label: "Messaging",
    icon: ChatBubblesIcon,
    items: [
      { href: "/broadcasts", label: "Broadcasts", icon: MegaphoneIcon },
      { href: "/email", label: "Email", icon: MailIcon },
      { href: "/outreach", label: "Outreach", icon: OutreachIcon },
    ],
  },
  {
    key: "automation",
    label: "Automation",
    icon: WorkflowIcon,
    items: [
      { href: "/automations", label: "Automations", icon: WorkflowIcon },
      { href: "/loop", label: "Loop Builder", icon: LoopBuilderIcon },
      { href: "/drip", label: "Drip Sequences", icon: DripIcon },
      { href: "/tasks", label: "Tasks", icon: TasksIcon },
    ],
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: MessageCircleIcon,
    items: [
      { href: "/groups", label: "TG Groups", icon: MessageCircleIcon },
      { href: "/access", label: "Access Control", icon: ShieldIcon },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    icon: ChartIcon,
    items: [
      { href: "/reports", label: "Reports", icon: ChartIcon },
      { href: "/graph", label: "Graph", icon: NetworkIcon },
      { href: "/calendar", label: "Calendar", icon: CalendarIcon },
    ],
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: "/docs", label: "Docs", icon: FileTextIcon },
  { href: "/suggestions", label: "Suggestions", icon: LightbulbIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

// --- Persist collapsed sections in localStorage ---

const STORAGE_KEY = "supracrm-nav-sections";

function useCollapsedSections() {
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

// --- Component ---

export function DesktopSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { sidebarCollapsed, setSidebarCollapsed, crmRole } = useShell();
  const sections = useCollapsedSections();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const sectionHasActive = (section: NavSection) =>
    section.items.some((item) => isActive(item.href));

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
      <nav className="flex-1 px-2 py-3 overflow-y-auto thin-scroll flex flex-col">
        {/* Top items — always visible */}
        <div className="space-y-0.5">
          {TOP_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={sidebarCollapsed} />
          ))}
        </div>

        {/* Collapsible sections */}
        <div className="mt-3 space-y-1 flex-1">
          {NAV_SECTIONS.map((section) => {
            const isOpen = !sections.collapsed[section.key];
            const hasActive = sectionHasActive(section);

            // When sidebar is collapsed, show section icon as a group indicator
            if (sidebarCollapsed) {
              return (
                <div key={section.key} className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={sidebarCollapsed} />
                  ))}
                </div>
              );
            }

            return (
              <div key={section.key}>
                <button
                  onClick={() => sections.toggle(section.key)}
                  className={cn(
                    "flex items-center w-full rounded-lg px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                    hasActive && !isOpen
                      ? "text-primary"
                      : "text-muted-foreground/60 hover:text-muted-foreground"
                  )}
                >
                  <ChevronIcon className="h-3 w-3 mr-1.5 shrink-0 transition-transform" open={isOpen} />
                  {section.label}
                </button>
                {isOpen && (
                  <div className="space-y-0.5 mt-0.5">
                    {section.items.map((item) => (
                      <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={sidebarCollapsed} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom items */}
        <div className="mt-3 pt-3 border-t border-white/5 space-y-0.5">
          {BOTTOM_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={sidebarCollapsed} />
          ))}

          {/* Admin link (only for admin_lead) */}
          {crmRole === "admin_lead" && (
            <NavLink
              item={{ href: "/admin", label: "Admin", icon: ShieldIcon }}
              active={isActive("/admin")}
              collapsed={sidebarCollapsed}
            />
          )}
        </div>
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

// --- Shared NavLink component ---

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
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
}

// --- Icons ---

function ChevronIcon({ className, open }: { className?: string; open: boolean }) {
  return (
    <svg
      className={cn(className, open ? "rotate-90" : "rotate-0")}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

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

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
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

function DripIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v6" />
      <path d="M12 22a5 5 0 005-5c0-4-5-9-5-9s-5 5-5 9a5 5 0 005 5z" />
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

function LoopBuilderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10" />
      <path d="M22 12c0-5.52-4.48-10-10-10" />
      <path d="M16 12l4 4-4 4" />
      <circle cx="12" cy="12" r="3" />
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

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14" />
    </svg>
  );
}
