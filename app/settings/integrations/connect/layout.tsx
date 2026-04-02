"use client";

import { TelegramProvider } from "@/lib/client/telegram-context";

export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TelegramProvider>{children}</TelegramProvider>;
}
