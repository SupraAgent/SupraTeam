"use client";

import * as React from "react";
import { ApplicationForm } from "@/app/apply/_components/application-form";
import { Loader2 } from "lucide-react";

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  };
};

interface QrContext {
  qrCodeId: string | null;
  campaign: string | null;
  source: string | null;
}

export default function TMAApplyPage() {
  const [tgData, setTgData] = React.useState<{
    initData: string;
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  } | null>(null);

  const [qrContext, setQrContext] = React.useState<QrContext>({
    qrCodeId: null,
    campaign: null,
    source: null,
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // Read QR code context from URL params
    const params = new URLSearchParams(window.location.search);
    setQrContext({
      qrCodeId: params.get("qr_code_id"),
      campaign: params.get("campaign"),
      source: params.get("source"),
    });

    const w = window as unknown as { Telegram?: { WebApp: TelegramWebApp } };
    if (w.Telegram) {
      const webapp = w.Telegram.WebApp;
      webapp.ready();
      webapp.expand();
      setTgData({
        initData: webapp.initData,
        user: webapp.initDataUnsafe?.user,
      });
      // Note: TG username is NOT auto-filled into Twitter handle — they are different platforms
    } else {
      // Not in Telegram — still render the form in web mode
      setTgData({ initData: "" });
    }
  }, []);

  if (!tgData) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ApplicationForm
      mode={tgData.initData ? "tma" : "web"}
      telegramInitData={tgData.initData || undefined}
      telegramUser={tgData.user}
      qrCodeId={qrContext.qrCodeId ?? undefined}
      qrCampaign={qrContext.campaign ?? undefined}
      qrSource={qrContext.source ?? undefined}
    />
  );
}
