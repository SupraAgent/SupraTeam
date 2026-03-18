"use client";

import { ShellProvider } from "./shell-context";
import { DesktopSidebar } from "./desktop-sidebar";
import { MobileHeader } from "./mobile-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <DesktopSidebar />
      <div className="md:pl-56 min-h-dvh flex flex-col">
        <MobileHeader />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </ShellProvider>
  );
}
