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
    header_bg_color?: string;
    accent_text_color?: string;
    section_bg_color?: string;
    section_header_text_color?: string;
    subtitle_text_color?: string;
    destructive_text_color?: string;
    bottom_bar_bg_color?: string;
  };
  colorScheme: "light" | "dark";
  isVersionAtLeast: (version: string) => boolean;
  onEvent: (eventType: string, callback: () => void) => void;
  offEvent: (eventType: string, callback: () => void) => void;
  showPopup: (params: { title?: string; message: string; buttons?: { id?: string; type?: string; text?: string }[] }, callback?: (id: string) => void) => void;
  showConfirm: (message: string, callback: (ok: boolean) => void) => void;
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
  SettingsButton: {
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

/** Map all available themeParams to CSS custom properties on :root */
function syncThemeToCSSVars(tg: TelegramWebApp) {
  const root = document.documentElement;
  const params = tg.themeParams;
  const mapping: [string, string | undefined][] = [
    ["--tg-theme-bg-color", params.bg_color],
    ["--tg-theme-text-color", params.text_color],
    ["--tg-theme-hint-color", params.hint_color],
    ["--tg-theme-link-color", params.link_color],
    ["--tg-theme-button-color", params.button_color],
    ["--tg-theme-button-text-color", params.button_text_color],
    ["--tg-theme-secondary-bg-color", params.secondary_bg_color],
    ["--tg-theme-header-bg-color", params.header_bg_color],
    ["--tg-theme-accent-text-color", params.accent_text_color],
    ["--tg-theme-section-bg-color", params.section_bg_color],
    ["--tg-theme-section-header-text-color", params.section_header_text_color],
    ["--tg-theme-subtitle-text-color", params.subtitle_text_color],
    ["--tg-theme-destructive-text-color", params.destructive_text_color],
    ["--tg-theme-bottom-bar-bg-color", params.bottom_bar_bg_color],
  ];
  for (const [prop, value] of mapping) {
    if (value) {
      root.style.setProperty(prop, value);
    }
  }
  root.dataset.tgColorScheme = tg.colorScheme;
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
  /** Show SettingsButton and call this on tap. Omit to hide. */
  onSettings?: () => void;
}

export function useTelegramWebApp(options: UseTelegramOptions = {}) {
  const { onBack, mainButtonText, onMainButton, mainButtonDisabled, mainButtonLoading, onSettings } = options;
  const [tgUser, setTgUser] = React.useState<{ id: number; first_name: string; username?: string } | null>(null);
  const [isValidated, setIsValidated] = React.useState(false);
  const webAppRef = React.useRef<TelegramWebApp | null>(null);

  // Store callbacks in refs to avoid re-subscription on every render
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;
  const onMainButtonRef = React.useRef(onMainButton);
  onMainButtonRef.current = onMainButton;
  const onSettingsRef = React.useRef(onSettings);
  onSettingsRef.current = onSettings;

  // Stable callback wrappers
  const backHandler = React.useRef(() => onBackRef.current?.());
  const mainHandler = React.useRef(() => onMainButtonRef.current?.());
  const settingsHandler = React.useRef(() => onSettingsRef.current?.());

  // Init on mount
  React.useEffect(() => {
    const tg = getWebApp();
    if (!tg) return;
    webAppRef.current = tg;
    tg.ready();
    tg.expand();

    // Sync all theme params to CSS variables
    syncThemeToCSSVars(tg);

    // Sync Telegram theme to header/bottom bar
    try {
      const bg = tg.themeParams.header_bg_color || tg.themeParams.bg_color || "#0a0c14";
      tg.setHeaderColor(bg);
      const bottomBg = tg.themeParams.bottom_bar_bg_color || tg.themeParams.bg_color || "#0a0c14";
      tg.setBottomBarColor(bottomBg);
    } catch {
      // Some older clients don't support these
    }

    // Listen for real-time theme changes
    const handleThemeChange = () => {
      syncThemeToCSSVars(tg);
      try {
        const bg = tg.themeParams.header_bg_color || tg.themeParams.bg_color || "#0a0c14";
        tg.setHeaderColor(bg);
        const bottomBg = tg.themeParams.bottom_bar_bg_color || tg.themeParams.bg_color || "#0a0c14";
        tg.setBottomBarColor(bottomBg);
      } catch { /* older clients */ }
    };
    tg.onEvent("themeChanged", handleThemeChange);

    // Validate initData server-side before trusting user identity
    if (tg.initData) {
      fetch("/api/tma/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.valid && data.user) {
            setTgUser(data.user);
            setIsValidated(true);
          } else {
            console.warn("[TMA] initData validation failed:", data.error);
            // Fall back to unsigned data for display only (not for auth)
            if (tg.initDataUnsafe?.user) setTgUser(tg.initDataUnsafe.user);
          }
        })
        .catch(() => {
          // Network error — fall back to unsigned data
          if (tg.initDataUnsafe?.user) setTgUser(tg.initDataUnsafe.user);
        });
    } else if (tg.initDataUnsafe?.user) {
      // No initData available (e.g. dev mode) — use unsigned data
      setTgUser(tg.initDataUnsafe.user);
    }

    return () => {
      tg.offEvent("themeChanged", handleThemeChange);
    };
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

  // SettingsButton
  const hasSettings = !!onSettings;
  React.useEffect(() => {
    const tg = webAppRef.current;
    if (!tg?.SettingsButton) return;

    if (hasSettings) {
      tg.SettingsButton.show();
      tg.SettingsButton.onClick(settingsHandler.current);
      return () => {
        tg.SettingsButton.offClick(settingsHandler.current);
        tg.SettingsButton.hide();
      };
    } else {
      tg.SettingsButton.hide();
    }
  }, [hasSettings]);

  return { tgUser, isValidated, webApp: webAppRef.current };
}
