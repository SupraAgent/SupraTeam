"use client";

import * as React from "react";

export type ViewDensity = "compact" | "comfortable" | "spacious";

type ShellContextValue = {
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  viewDensity: ViewDensity;
  setViewDensity: (v: ViewDensity) => void;
  crmRole: string | null;
  setCrmRole: (v: string | null) => void;
  crmRoleLoaded: boolean;
  setCrmRoleLoaded: (v: boolean) => void;
};

const ShellContext = React.createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = React.useState(false);
  const [viewDensity, setViewDensityState] = React.useState<ViewDensity>("comfortable");
  const [crmRole, setCrmRole] = React.useState<string | null>(null);
  const [crmRoleLoaded, setCrmRoleLoaded] = React.useState(false);

  // Hydrate from localStorage
  React.useEffect(() => {
    const saved = localStorage.getItem("supracrm:density");
    if (saved === "compact" || saved === "comfortable" || saved === "spacious") {
      setViewDensityState(saved);
    }
    const savedCollapsed = localStorage.getItem("supracrm:sidebar-collapsed");
    if (savedCollapsed === "true") setSidebarCollapsedState(true);
  }, []);

  const setSidebarCollapsed = React.useCallback((v: boolean) => {
    setSidebarCollapsedState(v);
    localStorage.setItem("supracrm:sidebar-collapsed", String(v));
  }, []);

  const setViewDensity = React.useCallback((v: ViewDensity) => {
    setViewDensityState(v);
    localStorage.setItem("supracrm:density", v);
  }, []);

  const value = React.useMemo(
    () => ({ mobileNavOpen, setMobileNavOpen, sidebarCollapsed, setSidebarCollapsed, viewDensity, setViewDensity, crmRole, setCrmRole, crmRoleLoaded, setCrmRoleLoaded }),
    [mobileNavOpen, sidebarCollapsed, viewDensity, setViewDensity, crmRole, crmRoleLoaded]
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
