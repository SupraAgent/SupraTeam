"use client";

import * as React from "react";
import { registerTMAServiceWorker, syncOfflineActions } from "@/lib/client/tma-offline";
import { OfflineBanner } from "@/components/tma/offline-banner";

export function TMAOfflineProvider({ children }: { children: React.ReactNode }) {
  // Register service worker on mount
  React.useEffect(() => {
    registerTMAServiceWorker();
  }, []);

  // When coming back online, auto-sync pending actions
  React.useEffect(() => {
    const handleOnline = () => {
      syncOfflineActions();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return (
    <>
      <OfflineBanner />
      {children}
    </>
  );
}
