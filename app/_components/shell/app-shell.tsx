"use client";

import * as React from "react";
import Link from "next/link";
import { ShellProvider } from "./shell-context";
import { DesktopSidebar } from "./desktop-sidebar";
import { MobileHeader } from "./mobile-header";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { CommandPalette } from "@/components/search/command-palette";
import { useAuth } from "@/lib/auth";
import { useShell } from "./shell-context";

function TelegramLoginButton({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <Link
      href="/login"
      className={`flex items-center gap-2 rounded-xl bg-[#2AABEE] text-white font-medium transition hover:bg-[#2AABEE]/90 ${
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"
      }`}
    >
      <svg className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
      Sign in with Telegram
    </Link>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { sidebarCollapsed, viewDensity } = useShell();

  // Apply density data attribute to html element
  React.useEffect(() => {
    document.documentElement.setAttribute("data-density", viewDensity);
  }, [viewDensity]);

  return (
    <>
      <DesktopSidebar />
      <div className={`min-h-dvh flex flex-col transition-all duration-200 ${sidebarCollapsed ? "md:pl-14" : "md:pl-56"}`}>
        <MobileHeader />
        {/* Desktop topbar */}
        <div className="hidden md:flex items-center justify-end gap-2 px-6 pt-4">
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            Search
            <kbd className="ml-1 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px]">⌘K</kbd>
          </button>
          {!user && <TelegramLoginButton />}
          <NotificationCenter />
        </div>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <AppShellInner>{children}</AppShellInner>
    </ShellProvider>
  );
}
