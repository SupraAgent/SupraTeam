"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toDisplayEndDate } from "@/lib/calendar/utils";
import {
  X, Calendar, Clock, MapPin, Video, ExternalLink, Users, User, Link2,
} from "lucide-react";
import type { CalendarEventItem } from "./event-list";

interface EventDetailProps {
  event: CalendarEventItem;
  onClose: () => void;
  linkedDeal?: { id: string; deal_name: string; stage_name?: string; stage_color?: string } | null;
  linkedContacts?: { id: string; name: string; email?: string }[];
}

function formatEventDateTime(event: CalendarEventItem): string {
  if (event.is_all_day) {
    const start = event.start_date ? new Date(event.start_date + "T00:00:00") : null;
    // Google uses exclusive end dates for all-day events — convert to inclusive for display
    const displayEnd = event.end_date ? toDisplayEndDate(event.end_date) : null;
    const end = displayEnd ? new Date(displayEnd + "T00:00:00") : null;
    if (!start) return "All day";
    const dateOpts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };
    if (!end || start.getTime() === end.getTime()) {
      return start.toLocaleDateString(undefined, dateOpts);
    }
    return `${start.toLocaleDateString(undefined, dateOpts)} - ${end.toLocaleDateString(undefined, dateOpts)}`;
  }

  const start = event.start_at ? new Date(event.start_at) : null;
  const end = event.end_at ? new Date(event.end_at) : null;

  if (!start) return "";

  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

  const datePart = start.toLocaleDateString(undefined, dateOpts);
  const startTime = start.toLocaleTimeString(undefined, timeOpts);

  if (!end) return `${datePart} at ${startTime}`;

  const endTime = end.toLocaleTimeString(undefined, timeOpts);
  return `${datePart}, ${startTime} - ${endTime}`;
}

export function EventDetail({ event, onClose, linkedDeal, linkedContacts }: EventDetailProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[hsl(225,35%,8%)] border border-white/10 rounded-xl p-5 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-400" />
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              event.status === "tentative"
                ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
            )}>
              Google Calendar
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-foreground mb-3">{event.summary}</h3>

        {/* Date/Time */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Clock className="h-4 w-4 shrink-0" />
          <span>{formatEventDateTime(event)}</span>
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}

        {/* Meet link */}
        {event.hangout_link && (
          <a
            href={event.hangout_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mb-3"
          >
            <Video className="h-4 w-4 shrink-0" />
            Join Google Meet
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {/* Description */}
        {event.description && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs font-medium text-muted-foreground mb-2">Description</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-6">
              {event.description}
            </p>
          </div>
        )}

        {/* Attendees */}
        {event.attendees && event.attendees.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Users className="h-3 w-3" />
              Attendees ({event.attendees.length})
            </p>
            <div className="space-y-1.5">
              {event.attendees.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className={cn(
                    "truncate",
                    a.self ? "text-primary" : "text-foreground"
                  )}>
                    {a.displayName || a.email}
                    {a.self && " (you)"}
                  </span>
                  {a.responseStatus && a.responseStatus !== "needsAction" && (
                    <span className={cn(
                      "text-[10px] shrink-0",
                      a.responseStatus === "accepted" ? "text-emerald-400" :
                      a.responseStatus === "declined" ? "text-red-400" :
                      "text-yellow-400"
                    )}>
                      {a.responseStatus}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked Deal */}
        {linkedDeal && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Link2 className="h-3 w-3" />
              Linked Deal
            </p>
            <Link
              href={`/pipeline?highlight=${linkedDeal.id}`}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              {linkedDeal.stage_color && (
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: linkedDeal.stage_color }}
                />
              )}
              {linkedDeal.deal_name}
            </Link>
          </div>
        )}

        {/* Linked Contacts */}
        {linkedContacts && linkedContacts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Users className="h-3 w-3" />
              Linked Contacts
            </p>
            <div className="space-y-1">
              {linkedContacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/contacts?highlight=${c.id}`}
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  <User className="h-3 w-3" />
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2">
          {event.html_link && (
            <a
              href={event.html_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/10 transition"
            >
              <ExternalLink className="h-3 w-3" />
              Open in Google Calendar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
