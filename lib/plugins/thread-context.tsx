"use client";

import * as React from "react";

interface ThreadState {
  email: string | null;
  senderName?: string;
  threadId: string | null;
  messages: { from: string; date: string; body: string }[] | null;
  subject?: string;
  dealId: string | null;
}

interface ThreadContextValue extends ThreadState {
  selectThread: (threadId: string, email?: string, senderName?: string) => void;
  selectDealThread: (threadId: string, dealId: string, email?: string) => void;
}

const ThreadCtx = React.createContext<ThreadContextValue | null>(null);

export function ThreadContextProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ThreadState>({
    email: null,
    threadId: null,
    messages: null,
    dealId: null,
  });

  const selectThread = React.useCallback(
    (threadId: string, email?: string, senderName?: string) => {
      setState((prev) => ({
        ...prev,
        threadId,
        email: email ?? prev.email,
        senderName: senderName ?? prev.senderName,
      }));
    },
    []
  );

  const selectDealThread = React.useCallback(
    (threadId: string, dealId: string, email?: string) => {
      setState((prev) => ({
        ...prev,
        threadId,
        dealId,
        email: email ?? prev.email,
      }));
    },
    []
  );

  const value = React.useMemo(
    () => ({ ...state, selectThread, selectDealThread }),
    [state, selectThread, selectDealThread]
  );

  return <ThreadCtx.Provider value={value}>{children}</ThreadCtx.Provider>;
}

export function useThreadContext() {
  const ctx = React.useContext(ThreadCtx);
  if (!ctx) throw new Error("useThreadContext must be used within ThreadContextProvider");
  return ctx;
}
