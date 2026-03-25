"use client";

import * as React from "react";
import { ApplicationForm } from "@/app/apply/_components/application-form";

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name: string; last_name?: string; username?: string };
  };
};

export default function TMAApplyPage() {
  const [tgData, setTgData] = React.useState<{
    initData: string;
    user?: { id: number; first_name: string; last_name?: string; username?: string };
  } | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as { Telegram?: { WebApp: TelegramWebApp } };
      if (w.Telegram) {
        const webapp = w.Telegram.WebApp;
        webapp.ready();
        webapp.expand();
        setTgData({
          initData: webapp.initData,
          user: webapp.initDataUnsafe?.user,
        });
      } else {
        // Not in Telegram — still render the form in web mode
        setTgData({ initData: "" });
      }
    }
  }, []);

  if (!tgData) return null;

  return (
    <ApplicationForm
      mode={tgData.initData ? "tma" : "web"}
      telegramInitData={tgData.initData || undefined}
      telegramUser={tgData.user}
    />
  );
}
