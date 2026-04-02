"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTelegram } from "@/lib/client/telegram-context";
import { Shield, Lock, Fingerprint } from "lucide-react";
import type { Api } from "telegram";

type Step = "idle" | "phone" | "code" | "2fa" | "qr" | "connected" | "needs-reauth";

export default function TelegramConnectPage() {
  const tg = useTelegram();
  const [step, setStep] = React.useState<Step>("idle");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [phoneCodeHash, setPhoneCodeHash] = React.useState("");
  const [qrUrl, setQrUrl] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const waitForScanRef = React.useRef<(() => Promise<Api.User>) | null>(null);

  // Sync step with context status
  React.useEffect(() => {
    if (tg.status === "connected") setStep("connected");
    else if (tg.status === "needs-reauth") setStep("needs-reauth");
    else if (tg.status === "disconnected") setStep("idle");
  }, [tg.status]);

  async function handleSendCode() {
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await tg.sendCode(phone.trim());
      setPhoneCodeHash(result.phoneCodeHash);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const user = await tg.signIn(phone.trim(), code.trim(), phoneCodeHash);
      setCode(""); // Clear verification code from memory
      const last4 = phone.replace(/\D/g, "").slice(-4);
      await tg.persistSession(user, last4);
      setPhone(""); // Clear phone number from memory
      setStep("connected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      if (msg.includes("SESSION_PASSWORD_NEEDED")) {
        setStep("2fa");
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
    setError("");
    try {
      const user = await tg.signIn2FA(password.trim());
      setPassword(""); // Clear 2FA password from memory immediately
      const last4 = phone.replace(/\D/g, "").slice(-4);
      await tg.persistSession(user, last4);
      setStep("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "2FA verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleQRLogin() {
    setLoading(true);
    setError("");
    try {
      const result = await tg.service.connect("");
      void result; // ensure client is ready
      const qr = await tg.service.requestQRLogin();
      setQrUrl(qr.qrUrl);
      setStep("qr");
      waitForScanRef.current = qr.waitForScan;

      // Wait for scan in background
      qr.waitForScan()
        .then(async (user) => {
          await tg.persistSession(user);
          setStep("connected");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "QR login failed");
          setStep("idle");
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : "QR login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await tg.disconnect();
      setStep("idle");
      setPhone("");
      setCode("");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  if (tg.status === "loading") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Connect Telegram</h1>
          <p className="mt-1 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Connect Telegram</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your personal Telegram account to import contacts, view conversations,
          and send messages from the CRM.
        </p>
      </div>

      {/* Connected state */}
      {step === "connected" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
              <CheckCircleIcon className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Telegram Connected</p>
              <p className="text-xs text-muted-foreground">
                {tg.phoneLast4 && `Phone ending in ${tg.phoneLast4}`}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={handleDisconnect} disabled={loading}>
              Disconnect
            </Button>
          </div>

          {/* Zero-knowledge privacy notice */}
          <ZeroKnowledgeNotice />
        </div>
      )}

      {/* Needs re-auth (legacy server-encrypted session) */}
      {step === "needs-reauth" && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Lock className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Upgrade to Zero-Knowledge Encryption</p>
              <p className="text-xs text-muted-foreground">
                Your session was encrypted server-side. Re-authenticate to enable
                client-side encryption where only your device holds the key.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setStep("idle")}>
            Re-authenticate
          </Button>
        </div>
      )}

      {/* Choose method */}
      {step === "idle" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
            <h2 className="text-sm font-medium text-foreground">Phone Number Login</h2>
            <p className="text-xs text-muted-foreground">
              Enter your phone number to receive a Telegram verification code.
            </p>
            <div className="flex gap-2">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1234567890"
                className="flex-1 font-mono text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
              />
              <Button size="sm" onClick={handleSendCode} disabled={loading || !phone.trim()}>
                {loading ? "Sending..." : "Send Code"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
            <h2 className="text-sm font-medium text-foreground">QR Code Login</h2>
            <p className="text-xs text-muted-foreground">
              Scan a QR code with your Telegram app. No phone number needed.
            </p>
            <Button size="sm" variant="outline" onClick={handleQRLogin} disabled={loading}>
              {loading ? "Generating..." : "Show QR Code"}
            </Button>
          </div>

          {/* Zero-knowledge privacy info */}
          <ZeroKnowledgeNotice />
        </div>
      )}

      {/* Code entry */}
      {step === "code" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Enter Verification Code</h2>
          <p className="text-xs text-muted-foreground">
            A code was sent to your Telegram app. Enter it below.
          </p>
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
          <Button size="sm" variant="ghost" onClick={() => { setStep("idle"); setCode(""); }}>
            Back
          </Button>
        </div>
      )}

      {/* 2FA */}
      {step === "2fa" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Two-Factor Authentication</h2>
          <p className="text-xs text-muted-foreground">
            Your Telegram account has 2FA enabled. Enter your cloud password.
          </p>
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

      {/* QR Code */}
      {step === "qr" && qrUrl && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4 text-center">
          <h2 className="text-sm font-medium text-foreground">Scan with Telegram</h2>
          <p className="text-xs text-muted-foreground">
            Open Telegram &gt; Settings &gt; Devices &gt; Link Desktop Device
          </p>
          <div className="flex justify-center py-4">
            <div className="rounded-2xl bg-white p-4">
              <div className="h-48 w-48 flex items-center justify-center bg-gray-100 rounded-lg">
                <p className="text-xs text-gray-600 text-center px-2 break-all font-mono">
                  {qrUrl}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground animate-pulse">Waiting for scan...</p>
          <Button size="sm" variant="ghost" onClick={() => setStep("idle")}>
            Cancel
          </Button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

/** Zero-knowledge privacy notice — shared between idle and connected states. */
function ZeroKnowledgeNotice() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium text-foreground">Zero-Knowledge Encryption</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-green-400 font-medium mb-1">How it works:</p>
          <ul className="space-y-1 text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <Shield className="h-3 w-3 mt-0.5 shrink-0 text-green-400/60" />
              Telegram connects directly from your browser
            </li>
            <li className="flex items-start gap-1.5">
              <Shield className="h-3 w-3 mt-0.5 shrink-0 text-green-400/60" />
              Encryption key never leaves your device
            </li>
            <li className="flex items-start gap-1.5">
              <Shield className="h-3 w-3 mt-0.5 shrink-0 text-green-400/60" />
              Session stored as encrypted blob server can&apos;t read
            </li>
          </ul>
        </div>
        <div>
          <p className="text-red-400 font-medium mb-1">Our server never sees:</p>
          <ul className="space-y-1 text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <Lock className="h-3 w-3 mt-0.5 shrink-0 text-red-400/60" />
              Your messages or conversations
            </li>
            <li className="flex items-start gap-1.5">
              <Lock className="h-3 w-3 mt-0.5 shrink-0 text-red-400/60" />
              Your contacts or phone number
            </li>
            <li className="flex items-start gap-1.5">
              <Lock className="h-3 w-3 mt-0.5 shrink-0 text-red-400/60" />
              Your Telegram session key
            </li>
          </ul>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        AES-256-GCM · Device-bound key in IndexedDB · Non-extractable CryptoKey
      </p>
    </div>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
