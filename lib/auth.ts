"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isDevAuth: boolean;
};

const AuthContext = React.createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  isDevAuth: false,
});

/** Synthetic user for dev-access sessions. */
const DEV_USER = {
  id: "dev-00000000-0000-0000-0000-000000000000",
  email: "dev@supracrm.local",
  app_metadata: {},
  user_metadata: { full_name: "Dev User" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as User;

function hasDevAuthCookie(): boolean {
  return typeof document !== "undefined" && document.cookie.includes("dev-auth=true");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isDevAuth, setIsDevAuth] = React.useState(false);

  React.useEffect(() => {
    // Check dev-auth cookie first
    if (hasDevAuthCookie()) {
      setUser(DEV_USER);
      setIsDevAuth(true);
      setLoading(false);
      return;
    }

    const supabase = createClient();

    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = React.useCallback(async () => {
    if (isDevAuth) {
      await fetch("/api/auth/dev-login", { method: "DELETE" });
      window.location.href = "/login";
      return;
    }
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    window.location.href = "/login";
  }, [isDevAuth]);

  const value = React.useMemo(
    () => ({ user, loading, signOut, isDevAuth }),
    [user, loading, signOut, isDevAuth]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  return React.useContext(AuthContext);
}
