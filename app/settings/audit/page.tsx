"use client";

import * as React from "react";

type AuditEntry = {
  id: string;
  user_id: string;
  action: string;
  thread_id: string | null;
  recipient: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_OPTIONS = [
  { label: "All actions", value: "" },
  { label: "Thread archive", value: "thread_archive" },
  { label: "Thread trash", value: "thread_trash" },
  { label: "Thread star", value: "thread_star" },
  { label: "Thread read", value: "thread_read" },
  { label: "Thread unread", value: "thread_unread" },
  { label: "Thread labels", value: "thread_labels" },
  { label: "Email send", value: "email_send" },
  { label: "Email reply", value: "email_reply" },
  { label: "Email forward", value: "email_forward" },
  { label: "Email send_later", value: "email_send_later" },
  { label: "Email snooze", value: "email_snooze" },
  { label: "Email follow_up_reminder", value: "email_follow_up_reminder" },
  { label: "AI draft", value: "ai_draft" },
  { label: "AI compose", value: "ai_compose" },
  { label: "AI summarize", value: "ai_summarize" },
  { label: "AI search", value: "ai_search" },
  { label: "AI adjust-tone", value: "ai_adjust-tone" },
];

export default function AuditLogPage() {
  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actionFilter, setActionFilter] = React.useState("");

  const fetchEntries = React.useCallback(async (action: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (action) params.set("action", action);
      const res = await fetch(`/api/email/audit?${params}`);
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchEntries(actionFilter);
  }, [actionFilter, fetchEntries]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Email Audit Log</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Recent email actions logged across the system.
          </p>
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-400">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-zinc-500">No audit entries found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-zinc-400">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Thread ID</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {entries.map((entry) => (
                <tr key={entry.id} className="text-zinc-300 hover:bg-zinc-800/50">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-200">
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                    {entry.thread_id
                      ? entry.thread_id.length > 16
                        ? `${entry.thread_id.slice(0, 16)}...`
                        : entry.thread_id
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {entry.recipient ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {entry.metadata
                      ? Object.entries(entry.metadata)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
