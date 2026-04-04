"use client";

import * as React from "react";
import { Calendar, Clock, AlertCircle, FileText, ChevronDown, ExternalLink } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

interface Booking {
  id: string;
  status: string;
  invitee_email: string | null;
  invitee_name: string | null;
  scheduled_at: string | null;
  calendly_event_type_name: string | null;
  calendly_event_type_duration: number | null;
  booked_at: string | null;
  canceled_at: string | null;
  no_show_detected_at: string | null;
}

interface Transcript {
  id: string;
  title: string | null;
  duration_minutes: number | null;
  scheduled_at: string | null;
  summary: string | null;
  action_items: Array<{ text: string; assignee?: string; completed?: boolean }>;
  sentiment: Record<string, unknown>;
  transcript_url: string;
  speakers: Array<{ name: string; email?: string; talk_time_pct?: number }>;
}

interface MeetingsTabProps {
  dealId: string;
}

export function MeetingsTab({ dealId }: MeetingsTabProps) {
  const [upcoming, setUpcoming] = React.useState<Booking[]>([]);
  const [past, setPast] = React.useState<Booking[]>([]);
  const [transcripts, setTranscripts] = React.useState<Transcript[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchMeetings();
  }, [dealId]);

  async function fetchMeetings() {
    try {
      const res = await fetch(`/api/deals/${dealId}/meetings`);
      if (res.ok) {
        const { data } = await res.json();
        setUpcoming(data?.upcoming ?? []);
        setPast(data?.past ?? []);
        setTranscripts(data?.transcripts ?? []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground py-4">Loading meetings...</div>;
  }

  const hasData = upcoming.length > 0 || past.length > 0 || transcripts.length > 0;

  if (!hasData) {
    return (
      <div className="py-6 text-center">
        <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No meetings yet.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Send a booking link to schedule a meeting.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Upcoming
          </h4>
          <div className="space-y-2">
            {upcoming.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-sm font-medium text-foreground">
                    {b.calendly_event_type_name || "Meeting"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    with {b.invitee_name || b.invitee_email}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {b.scheduled_at
                    ? new Date(b.scheduled_at).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Time TBD"}
                  {b.calendly_event_type_duration && (
                    <span className="ml-1 opacity-60">
                      ({b.calendly_event_type_duration} min)
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past meetings with transcripts */}
      {transcripts.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Past Meetings
          </h4>
          <div className="space-y-2">
            {transcripts.map((t) => (
              <TranscriptCard key={t.id} transcript={t} />
            ))}
          </div>
        </div>
      )}

      {/* No-shows */}
      {past.filter((b) => b.status === "no_show").length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            No-Shows
          </h4>
          <div className="space-y-2">
            {past
              .filter((b) => b.status === "no_show")
              .map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-red-500/10 bg-red-500/[0.03] p-3"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-sm text-foreground">
                      {b.calendly_event_type_name || "Meeting"}
                    </span>
                    <span className="text-xs text-red-400">No-show</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {b.invitee_name || b.invitee_email} — {b.scheduled_at ? new Date(b.scheduled_at).toLocaleDateString() : ""}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TranscriptCard({ transcript: t }: { transcript: Transcript }) {
  const [expanded, setExpanded] = React.useState(false);

  const sentimentOverall = typeof t.sentiment?.overall === "number"
    ? Math.round((t.sentiment.overall as number) * 100)
    : null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-sm font-medium text-foreground">
            {t.title || "Call"}
          </span>
          {t.duration_minutes && (
            <span className="text-xs text-muted-foreground">
              {t.duration_minutes} min
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {t.summary && (
        <p className={cn("text-xs text-muted-foreground", !expanded && "line-clamp-2")}>
          {t.summary}
        </p>
      )}

      {expanded && (
        <>
          {/* Action Items */}
          {t.action_items?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Action Items</p>
              {t.action_items.map((item, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="mt-0.5">{item.completed ? "✓" : "○"}</span>
                  <span>
                    {item.text}
                    {item.assignee && (
                      <span className="ml-1 opacity-60">({item.assignee})</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Sentiment */}
          {sentimentOverall !== null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sentiment:</span>
              <span
                className={cn(
                  "text-xs font-medium",
                  sentimentOverall >= 70
                    ? "text-emerald-400"
                    : sentimentOverall >= 40
                      ? "text-amber-400"
                      : "text-red-400"
                )}
              >
                {sentimentOverall}% positive
              </span>
            </div>
          )}

          {/* Link to full transcript */}
          {t.transcript_url && (
            <a
              href={t.transcript_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View Full Transcript
            </a>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        {t.scheduled_at ? new Date(t.scheduled_at).toLocaleDateString() : ""}
      </p>
    </div>
  );
}
