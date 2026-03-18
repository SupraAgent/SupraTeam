"use client";

import * as React from "react";

type ShellContextValue = {
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
};

const ShellContext = React.createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const value = React.useMemo(
    () => ({ mobileNavOpen, setMobileNavOpen, sidebarCollapsed, setSidebarCollapsed }),
    [mobileNavOpen, sidebarCollapsed]
  );
  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = React.useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
