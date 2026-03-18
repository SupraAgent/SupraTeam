import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/app/_components/shell/app-shell";
import { ThemeProvider } from "@/app/_components/shell/theme-provider";
import { AuthProvider } from "@/lib/auth";
import { Suspense } from "react";
import { Toaster } from "sonner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SupraCRM",
  description: "Telegram-native CRM for BD, Marketing, and Admin teams."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            <Suspense fallback={null}>
              <AppShell>{children}</AppShell>
            </Suspense>
            <Toaster
              position="bottom-right"
              theme="dark"
              closeButton
              toastOptions={{
                duration: 4000,
                style: {
                  background: "hsl(225, 35%, 8%)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "hsl(210, 40%, 98%)",
                },
              }}
            />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
