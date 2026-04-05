"use client";

import * as React from "react";
import { Calendar, Copy, Send, Loader2, X, ExternalLink, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

interface CalendlyEventType {
  uri: string;
  name: string;
  duration: number;
  slug: string;
}

interface ScheduleCallModalProps {
  open: boolean;
  onClose: () => void;
  dealId: string;
  dealName: string;
  contactId?: string | null;
  telegramChatId?: number | null;
}

export function ScheduleCallModal({
  open,
  onClose,
  dealId,
  dealName,
  contactId,
  telegramChatId,
}: ScheduleCallModalProps) {
  const [eventTypes, setEventTypes] = React.useState<CalendlyEventType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<string>("");
  const [generatedUrl, setGeneratedUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setGeneratedUrl(null);
      setError(null);
      setCopied(false);
      fetchEventTypes();
    }
  }, [open]);

  async function fetchEventTypes() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendly/event-types");
      if (!res.ok) {
        setConnected(false);
        return;
      }
      const { data } = await res.json();
      setEventTypes(data ?? []);
      setConnected(true);
      if (data?.length === 1) {
        setSelectedType(data[0].uri);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!selectedType) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/calendly/booking-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: dealId,
          contact_id: contactId || undefined,
          event_type_uri: selectedType,
          tg_chat_id: telegramChatId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate link");
        return;
      }

      const url = data.data.booking_url;
      setGeneratedUrl(url);
      toast.success("Booking link generated");
    } catch {
      setError("Failed to generate booking link");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSendViaTg() {
    if (!generatedUrl || !telegramChatId) return;
    // Copy to clipboard first, then open TG chat link
    await navigator.clipboard.writeText(generatedUrl);
    toast.success("Link copied! Paste it in the Telegram chat.");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a2e] p-5 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#006BFF]/10">
              <Calendar className="h-4 w-4 text-[#006BFF]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">Schedule a Call</h3>
              <p className="text-[11px] text-muted-foreground truncate max-w-[250px]">{dealName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Not connected */}
        {!loading && connected === false && (
          <div className="text-center py-6 space-y-3">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-white/5">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-foreground">Calendly not connected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect your Calendly account to generate booking links for deals.
              </p>
            </div>
            <Link
              href="/settings/integrations"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-xs font-medium text-foreground hover:bg-white/10 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Go to Settings
            </Link>
          </div>
        )}

        {/* Connected - event type picker */}
        {!loading && connected && !generatedUrl && (
          <div className="space-y-3">
            {error && (
              <p className="text-xs text-red-400 rounded-lg bg-red-500/5 border border-red-500/10 p-2">{error}</p>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">Select event type</label>
              {eventTypes.map((et) => (
                <button
                  key={et.uri}
                  onClick={() => setSelectedType(et.uri)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    selectedType === et.uri
                      ? "border-[#006BFF]/50 bg-[#006BFF]/10"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                  )}
                >
                  <span className={cn(
                    "text-sm font-medium",
                    selectedType === et.uri ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {et.name}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground/60">{et.duration} min</span>
                </button>
              ))}
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!selectedType || generating}
              className="w-full"
            >
              {generating ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Calendar className="mr-2 h-3.5 w-3.5" />
              )}
              {generating ? "Generating..." : "Generate Booking Link"}
            </Button>
          </div>
        )}

        {/* Generated URL */}
        {generatedUrl && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs text-emerald-400 font-medium mb-1.5">Booking link ready</p>
              <p className="text-[11px] text-muted-foreground break-all font-mono">{generatedUrl}</p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCopy}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy Link"}
              </Button>

              {telegramChatId && (
                <Button
                  className="flex-1 bg-[#2AABEE] hover:bg-[#2AABEE]/90 text-white"
                  onClick={handleSendViaTg}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Send via TG
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => {
                  setGeneratedUrl(null);
                  setError(null);
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Generate another link
              </button>
              <a
                href={generatedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
              >
                Open link <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
