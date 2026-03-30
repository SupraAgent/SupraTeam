"use client";

import * as React from "react";

/**
 * Telegram WebApp SDK type subset.
 * Covers MainButton, BackButton, themeParams, and lifecycle.
 */
interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name: string; last_name?: string; username?: string };
  };
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  colorScheme: "light" | "dark";
  setHeaderColor: (color: string) => void;
  setBottomBarColor: (color: string) => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
}

interface UseTelegramOptions {
  /** Show native BackButton and call this on tap. Omit to hide. */
  onBack?: () => void;
  /** MainButton label. Omit to hide MainButton. */
  mainButtonText?: string;
  /** Called when MainButton is tapped. */
  onMainButton?: () => void;
  /** Disable MainButton (e.g. while submitting). */
  mainButtonDisabled?: boolean;
  /** Show spinner on MainButton. */
  mainButtonLoading?: boolean;
}

export function useTelegramWebApp(options: UseTelegramOptions = {}) {
  const { onBack, mainButtonText, onMainButton, mainButtonDisabled, mainButtonLoading } = options;
  const [tgUser, setTgUser] = React.useState<{ id: number; first_name: string; username?: string } | null>(null);
  const webAppRef = React.useRef<TelegramWebApp | null>(null);

  // Store callbacks in refs to avoid re-subscription on every render
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;
  const onMainButtonRef = React.useRef(onMainButton);
  onMainButtonRef.current = onMainButton;

  // Stable callback wrappers
  const backHandler = React.useRef(() => onBackRef.current?.());
  const mainHandler = React.useRef(() => onMainButtonRef.current?.());

  // Init on mount
  React.useEffect(() => {
    const tg = getWebApp();
    if (!tg) return;
    webAppRef.current = tg;
    tg.ready();
    tg.expand();

    // Sync Telegram theme to header/bottom bar
    try {
      const bg = tg.themeParams.bg_color || "#0a0c14";
      tg.setHeaderColor(bg);
      tg.setBottomBarColor(bg);
    } catch {
      // Some older clients don't support these
    }

    if (tg.initDataUnsafe?.user) {
      setTgUser(tg.initDataUnsafe.user);
    }
  }, []);

  // BackButton — only re-run when presence changes (not callback identity)
  const hasBack = !!onBack;
  React.useEffect(() => {
    const tg = webAppRef.current;
    if (!tg) return;

    if (hasBack) {
      tg.BackButton.show();
      tg.BackButton.onClick(backHandler.current);
      return () => {
        tg.BackButton.offClick(backHandler.current);
        tg.BackButton.hide();
      };
    } else {
      tg.BackButton.hide();
    }
  }, [hasBack]);

  // MainButton — re-run on text/state changes, not callback identity
  const hasMainButton = !!mainButtonText && !!onMainButton;
  React.useEffect(() => {
    const tg = webAppRef.current;
    if (!tg) return;

    if (hasMainButton && mainButtonText) {
      tg.MainButton.setText(mainButtonText);
      tg.MainButton.show();
      tg.MainButton.onClick(mainHandler.current);

      if (mainButtonDisabled) {
        tg.MainButton.disable();
      } else {
        tg.MainButton.enable();
      }

      if (mainButtonLoading) {
        tg.MainButton.showProgress(true);
      } else {
        tg.MainButton.hideProgress();
      }

      return () => {
        tg.MainButton.offClick(mainHandler.current);
        tg.MainButton.hide();
      };
    } else {
      tg.MainButton.hide();
    }
  }, [hasMainButton, mainButtonText, mainButtonDisabled, mainButtonLoading]);

  return { tgUser, webApp: webAppRef.current };
}
