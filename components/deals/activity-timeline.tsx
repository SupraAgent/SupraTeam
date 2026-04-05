"use client";

import * as React from "react";
import {
  GitBranch,
  Calendar,
  MessageCircle,
  StickyNote,
  Mail,
  AlertCircle,
  FileText,
  UserPlus,
  CheckSquare,
  XCircle,
  Clock,
  Filter,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  reference_id?: string;
  reference_type?: string;
  created_at: string;
}

interface ActivityTimelineProps {
  dealId: string;
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  stage_change: <GitBranch className="h-3.5 w-3.5" />,
  note_added: <StickyNote className="h-3.5 w-3.5" />,
  email_sent: <Mail className="h-3.5 w-3.5" />,
  email_received: <Mail className="h-3.5 w-3.5" />,
  tg_message: <MessageCircle className="h-3.5 w-3.5" />,
  booking_link_sent: <Calendar className="h-3.5 w-3.5" />,
  meeting_scheduled: <Calendar className="h-3.5 w-3.5" />,
  meeting_completed: <CheckSquare className="h-3.5 w-3.5" />,
  meeting_canceled: <XCircle className="h-3.5 w-3.5" />,
  meeting_rescheduled: <Clock className="h-3.5 w-3.5" />,
  meeting_no_show: <AlertCircle className="h-3.5 w-3.5" />,
  transcript_received: <FileText className="h-3.5 w-3.5" />,
  task_created: <CheckSquare className="h-3.5 w-3.5" />,
  contact_linked: <UserPlus className="h-3.5 w-3.5" />,
};

const ACTIVITY_COLORS: Record<string, string> = {
  stage_change: "text-violet-400 bg-violet-500/10",
  note_added: "text-amber-400 bg-amber-500/10",
  email_sent: "text-blue-400 bg-blue-500/10",
  email_received: "text-blue-400 bg-blue-500/10",
  tg_message: "text-[#2AABEE] bg-[#2AABEE]/10",
  booking_link_sent: "text-[#006BFF] bg-[#006BFF]/10",
  meeting_scheduled: "text-emerald-400 bg-emerald-500/10",
  meeting_completed: "text-emerald-400 bg-emerald-500/10",
  meeting_canceled: "text-red-400 bg-red-500/10",
  meeting_rescheduled: "text-amber-400 bg-amber-500/10",
  meeting_no_show: "text-red-400 bg-red-500/10",
  transcript_received: "text-purple-400 bg-purple-500/10",
  task_created: "text-teal-400 bg-teal-500/10",
  contact_linked: "text-sky-400 bg-sky-500/10",
};

const FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "meeting_scheduled,meeting_completed,meeting_canceled,meeting_rescheduled,meeting_no_show,booking_link_sent,transcript_received", label: "Meetings" },
  { value: "stage_change", label: "Stage Changes" },
  { value: "tg_message", label: "Messages" },
  { value: "note_added", label: "Notes" },
];

export function ActivityTimeline({ dealId }: ActivityTimelineProps) {
  const [activities, setActivities] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("");
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    fetchActivities();
  }, [dealId, filter]);

  async function fetchActivities() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("type", filter);
      const res = await fetch(`/api/deals/${dealId}/activities?${params}`);
      if (res.ok) {
        const { data } = await res.json();
        setActivities(data ?? []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header with filter */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Activity</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-white/10 bg-white/[0.02] pl-7 pr-6 py-1 text-xs text-muted-foreground focus:border-primary/50 focus:outline-none"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      {collapsed ? (
        <p className="text-xs text-muted-foreground">
          {activities.length} activities
        </p>
      ) : loading ? (
        <div className="text-xs text-muted-foreground">Loading...</div>
      ) : activities.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activities yet.</p>
      ) : (
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-white/5" />

          {activities.map((activity, i) => (
            <div key={activity.id} className="relative flex gap-3 py-2">
              {/* Icon */}
              <div
                className={cn(
                  "relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full",
                  ACTIVITY_COLORS[activity.type] ?? "text-muted-foreground bg-white/5"
                )}
              >
                {ACTIVITY_ICONS[activity.type] ?? (<Clock className="h-3.5 w-3.5" />)}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs text-foreground leading-relaxed">
                  {activity.title}
                </p>
                {activity.body && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {activity.body}
                  </p>
                )}
                {typeof activity.metadata?.scheduled_at === "string" && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(activity.metadata.scheduled_at).toLocaleString()}
                  </p>
                )}
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="text-[10px] text-muted-foreground/60">
                    {timeAgo(activity.created_at)}
                  </p>
                  {activity.type === "tg_message" && typeof activity.metadata?.tg_deep_link === "string" && (
                    <a
                      href={activity.metadata.tg_deep_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[#2AABEE]/70 hover:text-[#2AABEE] transition-colors"
                    >
                      View in Telegram
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
