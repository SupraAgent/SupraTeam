"use client";

import * as React from "react";

const UNDO_SEND_SECONDS = 60;

type PendingSend = {
  id: string;
  payload: Record<string, unknown>;
  timestamp: number;
};

type UndoSendContextValue = {
  pendingSend: PendingSend | null;
  queueSend: (payload: Record<string, unknown>) => void;
  cancelSend: () => void;
  secondsLeft: number;
};

const UndoSendContext = React.createContext<UndoSendContextValue>({
  pendingSend: null,
  queueSend: () => {},
  cancelSend: () => {},
  secondsLeft: 0,
});

export function useUndoSend() {
  return React.useContext(UndoSendContext);
}

export function UndoSendProvider({ children, onSent }: { children: React.ReactNode; onSent?: () => void }) {
  const [pendingSend, setPendingSend] = React.useState<PendingSend | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timerRef.current = null;
    countdownRef.current = null;
  }, []);

  const executeSend = React.useCallback(async (payload: Record<string, unknown>) => {
    try {
      await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onSent?.();
    } catch {
      // Failed send — user already closed compose, not much we can do
    }
  }, [onSent]);

  const queueSend = React.useCallback((payload: Record<string, unknown>) => {
    cleanup();
    const id = crypto.randomUUID();
    const send: PendingSend = { id, payload, timestamp: Date.now() };
    setPendingSend(send);
    setSecondsLeft(UNDO_SEND_SECONDS);

    // Countdown display
    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    // Actually send after delay
    timerRef.current = setTimeout(() => {
      executeSend(payload);
      setPendingSend(null);
      setSecondsLeft(0);
      cleanup();
    }, UNDO_SEND_SECONDS * 1000);
  }, [cleanup, executeSend]);

  const cancelSend = React.useCallback(() => {
    cleanup();
    setPendingSend(null);
    setSecondsLeft(0);
  }, [cleanup]);

  // Cleanup on unmount
  React.useEffect(() => cleanup, [cleanup]);

  return (
    <UndoSendContext.Provider value={{ pendingSend, queueSend, cancelSend, secondsLeft }}>
      {children}
    </UndoSendContext.Provider>
  );
}

export function UndoSendBar() {
  const { pendingSend, cancelSend, secondsLeft } = useUndoSend();

  if (!pendingSend) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-80 overflow-hidden rounded-xl border border-white/10 shadow-2xl"
      style={{ backgroundColor: "hsl(var(--surface-5))" }}
    >
      {/* Progress bar */}
      <div className="h-0.5 bg-white/5 w-full">
        <div
          className="h-full bg-primary undo-progress"
          style={{ animationDuration: `${UNDO_SEND_SECONDS}s` }}
        />
      </div>
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground">Sending in {secondsLeft}s</span>
        </div>
        <button
          onClick={cancelSend}
          className="text-xs font-semibold text-primary hover:text-primary/80 transition"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
