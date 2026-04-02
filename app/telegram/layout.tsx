"use client";

import { TelegramProvider } from "@/lib/client/telegram-context";

export default function TelegramLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TelegramProvider>{children}</TelegramProvider>;
}
