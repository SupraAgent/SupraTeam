/**
 * Telegram WebApp haptic feedback wrapper.
 * Falls back to no-op when not in Telegram context.
 */

interface TelegramHaptic {
  impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred: (type: "error" | "success" | "warning") => void;
  selectionChanged: () => void;
}

function getHaptic(): TelegramHaptic | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: TelegramHaptic } } })
    .Telegram?.WebApp?.HapticFeedback;
  return tg ?? null;
}

export function hapticImpact(style: "light" | "medium" | "heavy" = "light") {
  getHaptic()?.impactOccurred(style);
}

export function hapticNotification(type: "success" | "error" | "warning") {
  getHaptic()?.notificationOccurred(type);
}

export function hapticSelection() {
  getHaptic()?.selectionChanged();
}
