"use client";

import { ShellProvider } from "./shell-context";
import { DesktopSidebar } from "./desktop-sidebar";
import { MobileHeader } from "./mobile-header";
import { NotificationCenter } from "@/components/notifications/notification-center";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <DesktopSidebar />
      <div className="md:pl-56 min-h-dvh flex flex-col">
        <MobileHeader />
        {/* Desktop topbar */}
        <div className="hidden md:flex items-center justify-end gap-2 px-6 pt-4">
          <NotificationCenter />
        </div>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </ShellProvider>
  );
}
