"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Calendar, Clock, MapPin, Video, ExternalLink, Users } from "lucide-react";

export interface CalendarEventItem {
  id: string;
  calendar_id: string;
  google_event_id: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_all_day: boolean;
  status: string;
  organizer?: { email: string; displayName?: string; self?: boolean } | null;
  attendees?: { email: string; displayName?: string; responseStatus?: string; self?: boolean }[] | null;
  html_link?: string | null;
  hangout_link?: string | null;
}

interface EventListProps {
  events: CalendarEventItem[];
  loading?: boolean;
  onEventClick?: (event: CalendarEventItem) => void;
  compact?: boolean;
  className?: string;
}

function formatEventTime(event: CalendarEventItem): string {
  if (event.is_all_day) return "All day";

  const start = event.start_at ? new Date(event.start_at) : null;
  const end = event.end_at ? new Date(event.end_at) : null;

  if (!start) return "";

  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const startStr = start.toLocaleTimeString(undefined, timeOpts);

  if (!end) return startStr;

  const endStr = end.toLocaleTimeString(undefined, timeOpts);
  return `${startStr} - ${endStr}`;
}

function getEventColor(event: CalendarEventItem): string {
  if (event.status === "tentative") return "border-yellow-500/30";
  if (event.hangout_link) return "border-blue-500/30";
  return "border-emerald-500/30";
}

function getEventDotColor(event: CalendarEventItem): string {
  if (event.status === "tentative") return "bg-yellow-400";
  if (event.hangout_link) return "bg-blue-400";
  return "bg-emerald-400";
}

export function EventList({ events, loading, onEventClick, compact, className }: EventListProps) {
  if (loading) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-white/[0.03] animate-pulse" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center text-center py-10", className)}>
        <div className="rounded-xl bg-white/[0.03] p-4 mb-3">
          <Calendar className="h-8 w-8 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No upcoming events</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Your schedule is clear</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {events.map((event) => (
        <button
          key={event.id}
          onClick={() => onEventClick?.(event)}
          className={cn(
            "w-full text-left rounded-lg border-l-2 px-3 py-2 transition-colors hover:bg-white/[0.04]",
            getEventColor(event),
            compact ? "py-1.5" : "py-2"
          )}
        >
          <div className="flex items-start gap-2">
            <div className={cn("h-1.5 w-1.5 rounded-full mt-1.5 shrink-0", getEventDotColor(event))} />
            <div className="flex-1 min-w-0">
              <p className={cn(
                "font-medium text-foreground truncate",
                compact ? "text-xs" : "text-sm"
              )}>
                {event.summary}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {formatEventTime(event)}
                </span>
                {event.location && !compact && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[150px]">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    {event.location}
                  </span>
                )}
                {event.hangout_link && (
                  <span className="flex items-center gap-1 text-[11px] text-blue-400">
                    <Video className="h-2.5 w-2.5" />
                    {compact ? "" : "Meet"}
                  </span>
                )}
                {event.attendees && event.attendees.length > 0 && !compact && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="h-2.5 w-2.5" />
                    {event.attendees.length}
                  </span>
                )}
              </div>
            </div>
            {event.html_link && !compact && (
              <a
                href={event.html_link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
