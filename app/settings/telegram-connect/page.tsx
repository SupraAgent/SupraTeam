"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ConnectionStatus = {
  connected: boolean;
  telegramUserId?: number;
  phoneLast4?: string;
  connectedAt?: string;
};

type Step = "idle" | "phone" | "code" | "2fa" | "qr" | "connected";

export default function TelegramConnectPage() {
  const [status, setStatus] = React.useState<ConnectionStatus | null>(null);
  const [step, setStep] = React.useState<Step>("idle");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [phoneCodeHash, setPhoneCodeHash] = React.useState("");
  const [qrUrl, setQrUrl] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const qrPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Check connection status on mount
  React.useEffect(() => {
    fetchStatus();
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/telegram-client/status");
      const data = await res.json();
      setStatus(data);
      if (data.connected) setStep("connected");
    } finally {
      setInitialLoading(false);
    }
  }

  async function handleSendCode() {
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram-client/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send code");
        return;
      }
      setPhoneCodeHash(data.phoneCodeHash);
      setStep("code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram-client/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          phoneCodeHash,
          password: password || undefined,
        }),
      });
      const data = await res.json();
      if (data.error === "2FA_REQUIRED") {
        setStep("2fa");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }
      setStep("connected");
      fetchStatus();
    } finally {
      setLoading(false);
    }
  }

  async function handleQRLogin() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram-client/qr-login", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "QR login failed");
        return;
      }
      setQrUrl(data.qrUrl);
      setStep("qr");

      // Poll for confirmation
      qrPollRef.current = setInterval(async () => {
        const pollRes = await fetch("/api/telegram-client/qr-login");
        const pollData = await pollRes.json();
        if (pollData.status === "confirmed") {
          if (qrPollRef.current) clearInterval(qrPollRef.current);
          setStep("connected");
          fetchStatus();
        } else if (pollData.status === "expired") {
          if (qrPollRef.current) clearInterval(qrPollRef.current);
          setError("QR code expired. Try again.");
          setStep("idle");
        }
      }, 2000);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await fetch("/api/telegram-client/disconnect", { method: "POST" });
      setStatus({ connected: false });
      setStep("idle");
      setPhone("");
      setCode("");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
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
      {step === "connected" && status?.connected && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
              <CheckCircleIcon className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Telegram Connected</p>
              <p className="text-xs text-muted-foreground">
                {status.phoneLast4 && `Phone ending in ${status.phoneLast4}`}
                {status.connectedAt && ` · Connected ${new Date(status.connectedAt).toLocaleDateString()}`}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={handleDisconnect} disabled={loading}>
              Disconnect
            </Button>
          </div>

          {/* Privacy notice */}
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Privacy:</strong> Your contacts and DMs are only visible to you.
              Group messages from CRM-linked groups are shared with team members who have access.
              Sessions are encrypted with AES-256-GCM.
            </p>
          </div>
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

          {/* Privacy info */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
            <h2 className="text-sm font-medium text-foreground">What We Access</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-green-400 font-medium mb-1">We access:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>Your contact list</li>
                  <li>Your conversations (read-only)</li>
                  <li>Ability to send messages as you</li>
                  <li>Group memberships</li>
                </ul>
              </div>
              <div>
                <p className="text-red-400 font-medium mb-1">We never:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>Store your DMs in our database</li>
                  <li>Show your contacts to others</li>
                  <li>Share your private conversations</li>
                  <li>Store your phone number in plaintext</li>
                </ul>
              </div>
            </div>
          </div>
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
              onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
            />
            <Button size="sm" onClick={handleVerifyCode} disabled={loading || !password.trim()}>
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
              {/* QR code rendered via canvas or external lib -- for now show URL */}
              <div className="h-48 w-48 flex items-center justify-center bg-gray-100 rounded-lg">
                <p className="text-xs text-gray-600 text-center px-2 break-all font-mono">
                  {qrUrl}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground animate-pulse">Waiting for scan...</p>
          <Button size="sm" variant="ghost" onClick={() => {
            if (qrPollRef.current) clearInterval(qrPollRef.current);
            setStep("idle");
          }}>
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

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
