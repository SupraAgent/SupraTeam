"use client";

import * as React from "react";
import { Calendar, Copy, Send, Loader2, X, ExternalLink, Settings, Video, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

interface CalendlyEventType {
  uri: string;
  name: string;
  duration: number;
  slug: string;
}

type ModalMode = "calendly" | "gcal";

interface ScheduleCallModalProps {
  open: boolean;
  onClose: () => void;
  dealId: string;
  dealName: string;
  contactId?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  telegramChatId?: number | null;
  onEventCreated?: () => void;
}

export function ScheduleCallModal({
  open,
  onClose,
  dealId,
  dealName,
  contactId,
  contactEmail,
  contactName,
  telegramChatId,
  onEventCreated,
}: ScheduleCallModalProps) {
  const [mode, setMode] = React.useState<ModalMode>("gcal");

  // Calendly state
  const [eventTypes, setEventTypes] = React.useState<CalendlyEventType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<string>("");
  const [generatedUrl, setGeneratedUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Google Calendar state
  const [gcalConnected, setGcalConnected] = React.useState<boolean | null>(null);
  const [gcalLoading, setGcalLoading] = React.useState(true);
  const [gcalCreating, setGcalCreating] = React.useState(false);
  const [gcalSummary, setGcalSummary] = React.useState("");
  const [gcalDate, setGcalDate] = React.useState("");
  const [gcalStartTime, setGcalStartTime] = React.useState("10:00");
  const [gcalDuration, setGcalDuration] = React.useState(30);
  const [gcalDescription, setGcalDescription] = React.useState("");
  const [gcalAttendeeEmail, setGcalAttendeeEmail] = React.useState("");
  const [gcalCreatedEvent, setGcalCreatedEvent] = React.useState<{
    htmlLink?: string;
    hangoutLink?: string;
    id?: string;
  } | null>(null);
  const [gcalSendingTg, setGcalSendingTg] = React.useState(false);

  const checkGcalConnection = React.useCallback(async () => {
    setGcalLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/calendar/google/events?from=${today}&to=${today}`);
      setGcalConnected(res.ok);
    } catch {
      setGcalConnected(false);
    } finally {
      setGcalLoading(false);
    }
  }, []);

  const fetchEventTypes = React.useCallback(async () => {
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
  }, []);

  React.useEffect(() => {
    if (open) {
      setGeneratedUrl(null);
      setError(null);
      setCopied(false);
      setGcalCreatedEvent(null);

      // Pre-fill GCal form
      setGcalSummary(`Call: ${dealName}`);
      setGcalDescription(contactName ? `Meeting with ${contactName} re: ${dealName}` : `Meeting re: ${dealName}`);
      setGcalAttendeeEmail(contactEmail ?? "");

      // Default to tomorrow in local date format (YYYY-MM-DD)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
      const d = String(tomorrow.getDate()).padStart(2, "0");
      setGcalDate(`${y}-${m}-${d}`);

      // Check connections
      fetchEventTypes();
      checkGcalConnection();
    }
  }, [open, dealName, contactEmail, contactName, fetchEventTypes, checkGcalConnection]);

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
          contact_id: contactId ?? undefined,
          event_type_uri: selectedType,
          tg_chat_id: telegramChatId ?? undefined,
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
    await navigator.clipboard.writeText(generatedUrl);
    toast.success("Link copied! Paste it in the Telegram chat.");
  }

  async function handleGcalCreate() {
    if (!gcalSummary || !gcalDate || !gcalStartTime) return;
    setGcalCreating(true);
    setError(null);

    try {
      // Build ISO timestamps preserving user's local timezone offset
      const startDate = new Date(`${gcalDate}T${gcalStartTime}:00`);
      const endDate = new Date(startDate.getTime() + gcalDuration * 60_000);

      // Format with timezone offset (e.g., 2026-04-05T10:00:00+05:00) instead of UTC
      const tzOffset = -startDate.getTimezoneOffset();
      const sign = tzOffset >= 0 ? "+" : "-";
      const absOffset = Math.abs(tzOffset);
      const tzHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
      const tzMins = String(absOffset % 60).padStart(2, "0");
      const tzSuffix = `${sign}${tzHours}:${tzMins}`;

      const formatLocalISO = (d: Date) => {
        const yr = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const dy = String(d.getDate()).padStart(2, "0");
        const hr = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        const sc = String(d.getSeconds()).padStart(2, "0");
        return `${yr}-${mo}-${dy}T${hr}:${mi}:${sc}${tzSuffix}`;
      };

      const attendees: { email: string }[] = [];
      if (gcalAttendeeEmail.trim()) {
        attendees.push({ email: gcalAttendeeEmail.trim() });
      }

      // Create event via existing API
      const res = await fetch("/api/calendar/google/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: gcalSummary,
          description: gcalDescription,
          startAt: formatLocalISO(startDate),
          endAt: formatLocalISO(endDate),
          attendees: attendees.length > 0 ? attendees : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create event");
        return;
      }

      const event = data.data;
      setGcalCreatedEvent(event);

      // Auto-link event to deal — retry to handle DB upsert latency
      if (event.id) {
        let linked = false;
        for (let attempt = 0; attempt < 3 && !linked; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
          const eventsRes = await fetch(`/api/calendar/google/events?from=${gcalDate}&to=${gcalDate}`);
          if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            const dbEvent = (eventsData.data ?? []).find(
              (e: { google_event_id: string }) => e.google_event_id === event.id
            );
            if (dbEvent) {
              await fetch("/api/calendar/link-deal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  deal_id: dealId,
                  calendar_event_id: dbEvent.id,
                }),
              });
              linked = true;
            }
          }
        }

        toast.success(linked ? "Event created and linked to deal" : "Event created (deal link pending)");
      } else {
        toast.success("Event created");
      }

      onEventCreated?.();
    } catch {
      setError("Failed to create calendar event");
    } finally {
      setGcalCreating(false);
    }
  }

  async function handleGcalSendTg() {
    if (!telegramChatId || !gcalCreatedEvent) return;
    setGcalSendingTg(true);
    try {
      const meetLink = gcalCreatedEvent.hangoutLink || gcalCreatedEvent.htmlLink;
      const startDate = new Date(`${gcalDate}T${gcalStartTime}:00`);
      const formattedDate = startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const formattedTime = startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

      const message = [
        `📅 Meeting scheduled: ${gcalSummary}`,
        `🕐 ${formattedDate} at ${formattedTime} (${gcalDuration}min)`,
        meetLink ? `\n🔗 ${meetLink}` : "",
      ].filter(Boolean).join("\n");

      await navigator.clipboard.writeText(message);
      toast.success("Meeting details copied! Paste in the Telegram chat.");
    } finally {
      setGcalSendingTg(false);
    }
  }

  if (!open) return null;

  const isGcalReady = !gcalLoading && gcalConnected;
  const isCalendlyReady = !loading && connected;

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

        {/* Mode Tabs */}
        <div className="flex gap-1 rounded-lg bg-white/5 p-1 mb-4">
          <button
            onClick={() => setMode("gcal")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "gcal"
                ? "bg-[#006BFF]/15 text-[#006BFF] border border-[#006BFF]/20"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Video className="h-3.5 w-3.5" />
            Google Calendar
          </button>
          <button
            onClick={() => setMode("calendly")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "calendly"
                ? "bg-[#006BFF]/15 text-[#006BFF] border border-[#006BFF]/20"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Calendly
          </button>
        </div>

        {/* === Google Calendar Mode === */}
        {mode === "gcal" && (
          <>
            {gcalLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!gcalLoading && !gcalConnected && (
              <div className="text-center py-6 space-y-3">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-white/5">
                  <Calendar className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-foreground">Google Calendar not connected</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect your Google account to create calendar events directly from deals.
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

            {isGcalReady && !gcalCreatedEvent && (
              <div className="space-y-3">
                {error && (
                  <p className="text-xs text-red-400 rounded-lg bg-red-500/5 border border-red-500/10 p-2">{error}</p>
                )}

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Event Title</label>
                  <Input
                    value={gcalSummary}
                    onChange={(e) => setGcalSummary(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Date</label>
                    <Input
                      type="date"
                      value={gcalDate}
                      onChange={(e) => setGcalDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Time</label>
                    <Input
                      type="time"
                      value={gcalStartTime}
                      onChange={(e) => setGcalStartTime(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Duration</label>
                  <div className="flex gap-2 mt-1">
                    {[15, 30, 45, 60].map((d) => (
                      <button
                        key={d}
                        onClick={() => setGcalDuration(d)}
                        className={cn(
                          "flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors",
                          gcalDuration === d
                            ? "border-[#006BFF]/50 bg-[#006BFF]/10 text-foreground"
                            : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05]"
                        )}
                      >
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Attendee Email</label>
                  <Input
                    type="email"
                    value={gcalAttendeeEmail}
                    onChange={(e) => setGcalAttendeeEmail(e.target.value)}
                    placeholder="partner@protocol.xyz"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Description</label>
                  <Textarea
                    value={gcalDescription}
                    onChange={(e) => setGcalDescription(e.target.value)}
                    rows={2}
                    className="mt-1"
                  />
                </div>

                <Button
                  onClick={handleGcalCreate}
                  disabled={!gcalSummary || !gcalDate || !gcalStartTime || gcalCreating}
                  className="w-full"
                >
                  {gcalCreating ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Calendar className="mr-2 h-3.5 w-3.5" />
                  )}
                  {gcalCreating ? "Creating..." : "Create Event & Link to Deal"}
                </Button>
              </div>
            )}

            {gcalCreatedEvent && (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-xs text-emerald-400 font-medium mb-1.5">Event created & linked to deal</p>
                  <div className="space-y-1 text-[11px] text-muted-foreground">
                    <p>{gcalSummary}</p>
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(`${gcalDate}T${gcalStartTime}:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {" at "}
                      {new Date(`${gcalDate}T${gcalStartTime}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      {" · "}{gcalDuration}min
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {gcalCreatedEvent.htmlLink && (
                    <a
                      href={gcalCreatedEvent.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button variant="outline" className="w-full">
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Open in Calendar
                      </Button>
                    </a>
                  )}

                  {telegramChatId && (
                    <Button
                      className="flex-1 bg-[#2AABEE] hover:bg-[#2AABEE]/90 text-white"
                      onClick={handleGcalSendTg}
                      disabled={gcalSendingTg}
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Send via TG
                    </Button>
                  )}
                </div>

                <button
                  onClick={() => {
                    setGcalCreatedEvent(null);
                    setError(null);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Schedule another call
                </button>
              </div>
            )}
          </>
        )}

        {/* === Calendly Mode === */}
        {mode === "calendly" && (
          <>
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

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

            {isCalendlyReady && !generatedUrl && (
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
          </>
        )}
      </div>
    </div>
  );
}
