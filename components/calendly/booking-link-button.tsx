"use client";

import * as React from "react";
import { Calendar, Copy, Send, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendlyEventType {
  uri: string;
  name: string;
  duration: number;
  slug: string;
}

interface BookingLinkButtonProps {
  dealId?: string;
  contactId?: string;
  tgChatId?: number;
  /** If true, shows as compact inline button. Otherwise shows full dialog trigger. */
  compact?: boolean;
  onLinkGenerated?: (url: string) => void;
}

export function BookingLinkButton({
  dealId,
  contactId,
  tgChatId,
  compact,
  onLinkGenerated,
}: BookingLinkButtonProps) {
  const [eventTypes, setEventTypes] = React.useState<CalendlyEventType[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [showDialog, setShowDialog] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<string>("");
  const [generatedUrl, setGeneratedUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    fetchEventTypes();
  }, []);

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

  async function handleGenerate(eventTypeUri?: string) {
    setGenerating(true);
    setError(null);
    setGeneratedUrl(null);

    try {
      const res = await fetch("/api/calendly/booking-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: dealId,
          contact_id: contactId,
          event_type_uri: eventTypeUri || selectedType || undefined,
          tg_chat_id: tgChatId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.event_types) {
          // Multiple event types — show picker
          setEventTypes(data.event_types);
          setShowDialog(true);
          return;
        }
        setError(data.error || "Failed to generate link");
        return;
      }

      const url = data.data.booking_url;
      setGeneratedUrl(url);
      onLinkGenerated?.(url);

      // Copy to clipboard
      await navigator.clipboard.writeText(url);
    } catch {
      setError("Failed to generate booking link");
    } finally {
      setGenerating(false);
    }
  }

  // Not connected state
  if (connected === false) {
    return null; // Don't show button if Calendly not connected
  }

  // Loading state
  if (loading) return null;

  // Compact mode: single button for 1 event type
  if (compact && eventTypes.length === 1) {
    return (
      <button
        onClick={() => handleGenerate(eventTypes[0].uri)}
        disabled={generating}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-[#006BFF]/20 bg-[#006BFF]/5 px-3 py-1.5 text-xs font-medium text-[#006BFF] hover:bg-[#006BFF]/10 transition-colors disabled:opacity-50",
        )}
        title={`Send ${eventTypes[0].name} booking link`}
      >
        {generating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : generatedUrl ? (
          <Copy className="h-3.5 w-3.5" />
        ) : (
          <Calendar className="h-3.5 w-3.5" />
        )}
        {generatedUrl ? "Copied!" : `Send ${eventTypes[0].name}`}
      </button>
    );
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => {
          if (eventTypes.length === 1) {
            handleGenerate(eventTypes[0].uri);
          } else {
            setShowDialog(true);
          }
        }}
        disabled={generating}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-[#006BFF]/20 bg-[#006BFF]/5 px-3 py-1.5 text-xs font-medium text-[#006BFF] hover:bg-[#006BFF]/10 transition-colors disabled:opacity-50",
        )}
      >
        {generating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Calendar className="h-3.5 w-3.5" />
        )}
        {generatedUrl ? "Link Copied!" : "Send Booking Link"}
        {eventTypes.length > 1 && <ChevronDown className="h-3 w-3" />}
      </button>

      {/* Dialog for multiple event types */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1a2e] p-5 shadow-xl">
            <h3 className="text-sm font-medium text-foreground mb-3">Send Booking Link</h3>

            {error && (
              <p className="text-xs text-red-400 mb-3">{error}</p>
            )}

            <div className="space-y-2 mb-4">
              <label className="text-xs text-muted-foreground">Event Type</label>
              <div className="space-y-1">
                {eventTypes.map((et) => (
                  <button
                    key={et.uri}
                    onClick={() => setSelectedType(et.uri)}
                    className={cn(
                      "w-full rounded-lg border p-2.5 text-left text-sm transition-colors",
                      selectedType === et.uri
                        ? "border-[#006BFF]/50 bg-[#006BFF]/10 text-foreground"
                        : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05]"
                    )}
                  >
                    <span className="font-medium">{et.name}</span>
                    <span className="ml-2 text-xs opacity-60">{et.duration} min</span>
                  </button>
                ))}
              </div>
            </div>

            {generatedUrl && (
              <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                <p className="text-xs text-emerald-400 mb-1">Link copied to clipboard!</p>
                <p className="text-xs text-muted-foreground break-all">{generatedUrl}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDialog(false);
                  setError(null);
                  setGeneratedUrl(null);
                }}
                className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-white/5 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => handleGenerate()}
                disabled={!selectedType || generating}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#006BFF] px-3 py-2 text-xs font-medium text-white hover:bg-[#006BFF]/90 transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {generatedUrl ? "Generate New" : "Generate & Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
