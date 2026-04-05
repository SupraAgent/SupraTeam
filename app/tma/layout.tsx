import type { Metadata } from "next";
import "@/app/globals.css";
import { Suspense } from "react";
import { TMAOfflineProvider } from "./offline-provider";

export const metadata: Metadata = {
  title: "SupraTeam",
  description: "Telegram-native CRM",
};

export default function TMALayout({ children }: { children: React.ReactNode }) {
  // No sidebar, no topbar -- minimal layout for Telegram Mini App
  return (
    <div className="min-h-dvh bg-[var(--tg-theme-bg-color,hsl(225,35%,5%))]" style={{ overscrollBehavior: "contain" }}>
      <TMAOfflineProvider>
        <Suspense fallback={null}>{children}</Suspense>
      </TMAOfflineProvider>
    </div>
  );
}
