import type { Metadata } from "next";
import "@/app/globals.css";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "SupraCRM",
  description: "Telegram-native CRM",
};

export default function TMALayout({ children }: { children: React.ReactNode }) {
  // No sidebar, no topbar -- minimal layout for Telegram Mini App
  return (
    <div className="min-h-dvh bg-[hsl(225,35%,5%)]" style={{ overscrollBehavior: "contain" }}>
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
