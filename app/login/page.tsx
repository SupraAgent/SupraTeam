"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

declare global {
  interface Window {
    onTelegramAuth: (user: TelegramUser) => void;
  }
}

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export default function LoginPage() {
  const router = useRouter();
  const widgetRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    // Set up the callback before loading the widget
    window.onTelegramAuth = async (user: TelegramUser) => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Authentication failed. Please try again.");
          setLoading(false);
          return;
        }

        // Set the session in the browser Supabase client
        const supabase = createClient();
        if (supabase && data.access_token && data.refresh_token) {
          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
        }

        router.push("/");
        router.refresh();
      } catch {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      }
    };

    // Load Telegram widget script
    if (widgetRef.current && !widgetRef.current.querySelector("script")) {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;
      script.setAttribute("data-telegram-login", "SupraAdmin_bot");
      script.setAttribute("data-size", "large");
      script.setAttribute("data-radius", "12");
      script.setAttribute("data-onauth", "onTelegramAuth(user)");
      script.setAttribute("data-request-access", "write");
      widgetRef.current.appendChild(script);
    }
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <div className="h-4 w-4 rounded-full bg-primary shadow-[0_0_20px_rgba(12,206,107,0.5)]" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            Sign in to SupraCRM
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Telegram-native CRM for BD, Marketing, and Admin teams
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-4">
            <p className="text-sm text-muted-foreground">Signing in...</p>
          </div>
        ) : (
          <div ref={widgetRef} className="flex justify-center py-2" />
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Sign in with your Telegram account to access the CRM.
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            We only access your name, username, and profile photo. No messages, contacts, or phone number.
          </p>
        </div>
      </div>
    </div>
  );
}
