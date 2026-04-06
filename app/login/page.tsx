"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Github, ArrowLeft, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";

// Lazy-load GramJS service — only when user picks Telegram login
const getTgService = () =>
  import("@/lib/client/telegram-service").then((m) => m.TelegramBrowserService.getInstance());

type LoginMethod = "choose" | "github" | "phone" | "qr";
type PhoneStep = "input" | "code" | "2fa";

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = React.useState<LoginMethod>("choose");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Phone login state
  const [phone, setPhone] = React.useState("");
  const [phoneStep, setPhoneStep] = React.useState<PhoneStep>("input");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [phoneCodeHash, setPhoneCodeHash] = React.useState("");

  // QR login state
  const [qrUrl, setQrUrl] = React.useState("");
  const [privacyExpanded, setPrivacyExpanded] = React.useState(false);

  // Store the authenticated TG user for session creation
  const tgUserRef = React.useRef<{
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
  } | null>(null);

  // ── Complete login: set Supabase session + redirect ──

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

  // ── Challenge/verify: prove TG auth to server, get Supabase tokens ──

  async function challengeAndVerify(tgUser: {
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
  }) {
    // Step 1: Get challenge from server
    const challengeRes = await fetch("/api/auth/telegram-zk/challenge", {
      method: "POST",
    });
    if (!challengeRes.ok) {
      const err = await challengeRes.json();
      throw new Error(err.error || "Failed to get challenge");
    }
    const { challengeId, nonce } = await challengeRes.json();

    // Step 2: Verify with server
    const verifyRes = await fetch("/api/auth/telegram-zk/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, nonce, telegramUser: tgUser }),
    });
    if (!verifyRes.ok) {
      const err = await verifyRes.json();
      throw new Error(err.error || "Verification failed");
    }
    const { access_token, refresh_token } = await verifyRes.json();

    // Step 3: Save TG session string for TelegramProvider to pick up
    try {
      const service = await getTgService();
      const sessionString = service.getSessionString();
      if (sessionString) {
        sessionStorage.setItem("tg-pending-session", sessionString);
        // Store user info for session persistence
        sessionStorage.setItem("tg-pending-user", JSON.stringify(tgUser));
      }
    } catch {
      // Non-critical — TG connect can be done again later
    }

    await completeLogin(access_token, refresh_token);
  }

  // ── GitHub OAuth ──

  async function handleGitHubLogin() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Supabase not configured.");
        return;
      }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) setError(oauthError.message);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Phone login: client-side GramJS ──

  async function handleSendCode() {
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const service = await getTgService();
      await service.connect("");
      const result = await service.sendCode(phone.trim());
      setPhoneCodeHash(result.phoneCodeHash);
      setPhoneStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const service = await getTgService();
      const user = await service.signIn(phone.trim(), code.trim(), phoneCodeHash);
      const tgUser = {
        id: Number(user.id),
        firstName: user.firstName ?? "User",
        lastName: user.lastName ?? undefined,
        username: user.username ?? undefined,
      };
      tgUserRef.current = tgUser;
      setCode("");
      await challengeAndVerify(tgUser);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      if (msg.includes("SESSION_PASSWORD_NEEDED")) {
        setPhoneStep("2fa");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handle2FA() {
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const service = await getTgService();
      const user = await service.signIn2FA(password.trim());
      const tgUser = {
        id: Number(user.id),
        firstName: user.firstName ?? "User",
        lastName: user.lastName ?? undefined,
        username: user.username ?? undefined,
      };
      tgUserRef.current = tgUser;
      setPassword("");
      await challengeAndVerify(tgUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "2FA verification failed");
    } finally {
      setLoading(false);
    }
  }

  // ── QR login: client-side GramJS ──

  async function handleQRLogin() {
    setLoading(true);
    setError(null);
    try {
      const service = await getTgService();
      await service.connect("");
      const qr = await service.requestQRLogin();
      setQrUrl(qr.qrUrl);
      setLoading(false);

      // Wait for scan in background
      qr.waitForScan()
        .then(async (user) => {
          const tgUser = {
            id: Number(user.id),
            firstName: user.firstName ?? "User",
            lastName: user.lastName ?? undefined,
            username: user.username ?? undefined,
          };
          tgUserRef.current = tgUser;
          await challengeAndVerify(tgUser);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "QR login failed");
          setQrUrl("");
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : "QR login failed");
      setLoading(false);
    }
  }

  function goBack() {
    setMethod("choose");
    setPhoneStep("input");
    setCode("");
    setPassword("");
    setPhone("");
    setQrUrl("");
    setError(null);
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
            Sign in to SupraTeam
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

        {/* ── Method selection ── */}
        {method === "choose" && (
          <div className="space-y-3">
            {/* Telegram Phone */}
            <Button
              onClick={() => setMethod("phone")}
              className="w-full gap-2 bg-[#2AABEE] text-white hover:bg-[#2AABEE]/90 font-medium"
              size="lg"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              Sign in with Telegram
            </Button>

            {/* Telegram QR */}
            <Button
              onClick={() => setMethod("qr")}
              variant="outline"
              className="w-full gap-2 font-medium"
              size="lg"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="3" height="3" />
                <rect x="18" y="14" width="3" height="3" />
                <rect x="14" y="18" width="3" height="3" />
                <rect x="18" y="18" width="3" height="3" />
              </svg>
              QR Code Login
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* GitHub */}
            <Button
              onClick={handleGitHubLogin}
              disabled={loading}
              variant="outline"
              className="w-full gap-2 font-medium"
              size="lg"
            >
              <Github className="h-5 w-5" />
              {loading ? "Redirecting..." : "Continue with GitHub"}
            </Button>
          </div>
        )}

        {/* ── Phone Login Flow ── */}
        {method === "phone" && (
          <div className="space-y-4 text-left">
            <button onClick={goBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-3 w-3" /> Back
            </button>

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
                    onKeyDown={(e) => e.key === "Enter" && handle2FA()}
                  />
                  <Button size="sm" onClick={handle2FA} disabled={loading || !password.trim()}>
                    {loading ? "Verifying..." : "Submit"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── QR Login Flow ── */}
        {method === "qr" && (
          <div className="space-y-4">
            <button onClick={goBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-3 w-3" /> Back
            </button>

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
                  onClick={goBack}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Sign in with your Telegram account to access the CRM.
          </p>
          {(method === "phone" || method === "choose") && (
            <p className="text-[11px] text-muted-foreground/60">
              Zero-knowledge auth — Telegram connects directly from your browser.
              Your credentials never touch our server.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
