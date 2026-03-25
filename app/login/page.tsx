"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

type LoginMethod = "widget" | "phone" | "qr" | "dev";
type PhoneStep = "input" | "code" | "2fa";

export default function LoginPage() {
  const router = useRouter();
  const widgetRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [method, setMethod] = React.useState<LoginMethod>("qr");

  // Phone login state
  const [phone, setPhone] = React.useState("");
  const [phoneStep, setPhoneStep] = React.useState<PhoneStep>("input");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [phoneCodeHash, setPhoneCodeHash] = React.useState("");

  // Dev login state
  const [devPassword, setDevPassword] = React.useState("");

  // QR login state
  const [qrUrl, setQrUrl] = React.useState("");
  const [loginToken, setLoginToken] = React.useState("");
  const qrPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup QR polling on unmount
  React.useEffect(() => {
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, []);

  // Load Telegram widget when that tab is selected
  React.useEffect(() => {
    if (method !== "widget") return;

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
          setError(data.error ?? "Authentication failed.");
          setLoading(false);
          return;
        }
        await completeLogin(data.access_token, data.refresh_token);
      } catch {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      }
    };

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
  }, [method]); // eslint-disable-line react-hooks/exhaustive-deps

  async function completeLogin(accessToken: string, refreshToken: string) {
    const supabase = createClient();
    if (supabase && accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }
    router.push("/");
    router.refresh();
  }

  // ── Dev login handler ──

  async function handleDevLogin() {
    if (!devPassword.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: devPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid password");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Phone login handlers ──

  async function handleSendCode() {
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/telegram-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 503
          ? "Telegram API not configured. Ask an admin to set TELEGRAM_API_ID and TELEGRAM_API_HASH."
          : data.error || "Failed to send code");
        return;
      }
      setPhoneCodeHash(data.phoneCodeHash);
      setPhoneStep("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/telegram-phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          code: code.trim(),
          phoneCodeHash,
          password: password || undefined,
        }),
      });
      const data = await res.json();

      if (data.error === "2FA_REQUIRED") {
        setPhoneStep("2fa");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }
      await completeLogin(data.access_token, data.refresh_token);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── QR login handlers ──

  async function handleQRLogin() {
    setLoading(true);
    setError(null);
    if (qrPollRef.current) clearInterval(qrPollRef.current);

    try {
      const res = await fetch("/api/auth/telegram-qr", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 503
          ? "Telegram API not configured. Ask an admin to set TELEGRAM_API_ID and TELEGRAM_API_HASH."
          : data.error || "QR login failed");
        return;
      }
      setQrUrl(data.qrUrl);
      setLoginToken(data.loginToken);

      // Poll for confirmation
      qrPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/auth/telegram-qr?token=${data.loginToken}`);
          const pollData = await pollRes.json();
          if (pollData.status === "confirmed") {
            if (qrPollRef.current) clearInterval(qrPollRef.current);
            await completeLogin(pollData.access_token, pollData.refresh_token);
          } else if (pollData.status === "expired") {
            if (qrPollRef.current) clearInterval(qrPollRef.current);
            setError("QR code expired. Try again.");
            setQrUrl("");
            setLoginToken("");
          }
        } catch {
          // Ignore transient poll errors
        }
      }, 2000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function resetToMethodSelect() {
    setPhoneStep("input");
    setCode("");
    setPassword("");
    setError(null);
    if (qrPollRef.current) clearInterval(qrPollRef.current);
    setQrUrl("");
    setLoginToken("");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Header */}
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

        {/* Error display */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Method tabs */}
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
          {([
            ["phone", "Phone"],
            ["qr", "QR Code"],
            ["widget", "Widget"],
            ["dev", "Dev"],
          ] as [LoginMethod, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setMethod(key); resetToMethodSelect(); }}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                method === key
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Phone Login ── */}
        {method === "phone" && (
          <div className="space-y-4 text-left">
            {phoneStep === "input" && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-medium text-foreground">Phone Number</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enter your Telegram phone number to receive a verification code.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1234567890"
                    className="flex-1 font-mono text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSendCode} disabled={loading || !phone.trim()}>
                    {loading ? "Sending..." : "Send Code"}
                  </Button>
                </div>
              </div>
            )}

            {phoneStep === "code" && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-medium text-foreground">Verification Code</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A code was sent to your Telegram app. Enter it below.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="12345"
                    className="flex-1 font-mono text-lg tracking-widest text-center"
                    maxLength={6}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                  />
                  <Button size="sm" onClick={handleVerifyCode} disabled={loading || !code.trim()}>
                    {loading ? "Verifying..." : "Verify"}
                  </Button>
                </div>
                <button
                  onClick={() => { setPhoneStep("input"); setCode(""); setError(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back
                </button>
              </div>
            )}

            {phoneStep === "2fa" && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-medium text-foreground">Two-Factor Authentication</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your account has 2FA enabled. Enter your cloud password.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Cloud password"
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                  />
                  <Button size="sm" onClick={handleVerifyCode} disabled={loading || !password.trim()}>
                    {loading ? "Verifying..." : "Submit"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── QR Code Login ── */}
        {method === "qr" && (
          <div className="space-y-4">
            {!qrUrl ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
                <div className="text-left">
                  <h2 className="text-sm font-medium text-foreground">QR Code Login</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Scan a QR code with your Telegram app. No phone number needed.
                  </p>
                </div>
                <Button size="sm" onClick={handleQRLogin} disabled={loading} className="w-full">
                  {loading ? "Generating..." : "Show QR Code"}
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
                <h2 className="text-sm font-medium text-foreground">Scan with Telegram</h2>
                <p className="text-xs text-muted-foreground">
                  Open Telegram &gt; Settings &gt; Devices &gt; Link Desktop Device
                </p>
                <div className="flex justify-center py-2">
                  <div className="rounded-2xl bg-white p-4">
                    <div className="h-48 w-48 flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-xs text-gray-600 text-center px-2 break-all font-mono">
                        {qrUrl}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground animate-pulse">Waiting for scan...</p>
                <button
                  onClick={() => {
                    if (qrPollRef.current) clearInterval(qrPollRef.current);
                    setQrUrl("");
                    setLoginToken("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Widget Login ── */}
        {method === "widget" && (
          <div className="space-y-4">
            {loading ? (
              <div className="py-4">
                <p className="text-sm text-muted-foreground">Signing in...</p>
              </div>
            ) : (
              <div ref={widgetRef} className="flex justify-center py-3 px-4 rounded-xl bg-white/90 mx-auto w-fit min-h-[48px] items-center" />
            )}
            <p className="text-[11px] text-muted-foreground/60">
              Requires bot domain configured in BotFather.
            </p>
          </div>
        )}

        {/* ── Dev Access ── */}
        {method === "dev" && (
          <div className="space-y-4 text-left">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
              <div>
                <h2 className="text-sm font-medium text-foreground">Dev Access</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter the dev password to bypass Telegram auth.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={devPassword}
                  onChange={(e) => setDevPassword(e.target.value)}
                  placeholder="Dev password"
                  className="flex-1"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleDevLogin()}
                />
                <Button size="sm" onClick={handleDevLogin} disabled={loading || !devPassword.trim()}>
                  {loading ? "..." : "Enter"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Sign in with your Telegram account to access the CRM.
          </p>
          {method === "phone" && (
            <p className="text-[11px] text-muted-foreground/60">
              Your phone number is hashed and never stored in plaintext.
              Session encrypted with AES-256-GCM.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
