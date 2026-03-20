"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shield, Download, Trash2, Clock, Database, AlertTriangle, Check, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RetentionPolicy = {
  id: string;
  data_type: string;
  retention_days: number;
  auto_purge: boolean;
  last_purged_at: string | null;
};

type DeletionRequest = {
  id: string;
  target_type: string;
  target_id: string | null;
  status: string;
  scope: Record<string, boolean>;
  completed_at: string | null;
  created_at: string;
};

const DATA_TYPE_LABELS: Record<string, string> = {
  messages: "Telegram Messages",
  audit_logs: "Email Audit Logs",
  tracking_events: "Email Tracking Events",
  webhook_deliveries: "Webhook Delivery Logs",
  ai_conversations: "AI Conversations",
  outreach_step_logs: "Outreach Step Logs",
};

export default function PrivacyPage() {
  const [policies, setPolicies] = React.useState<RetentionPolicy[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [deletionRequests, setDeletionRequests] = React.useState<DeletionRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [purging, setPurging] = React.useState<string | null>(null);
  const [processing, setProcessing] = React.useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = React.useState<string | null>(null);
  const [editDays, setEditDays] = React.useState("");

  React.useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [retRes, delRes] = await Promise.all([
        fetch("/api/privacy/retention"),
        fetch("/api/privacy/delete"),
      ]);
      if (retRes.ok) {
        const d = await retRes.json();
        setPolicies(d.policies ?? []);
        setCounts(d.counts ?? {});
      }
      if (delRes.ok) {
        const d = await delRes.json();
        setDeletionRequests(d.requests ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function updatePolicy(id: string, retention_days: number, auto_purge?: boolean) {
    const body: Record<string, unknown> = { id, retention_days };
    if (auto_purge !== undefined) body.auto_purge = auto_purge;

    const res = await fetch("/api/privacy/retention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setPolicies((prev) =>
        prev.map((p) => (p.id === id ? { ...p, retention_days, ...(auto_purge !== undefined ? { auto_purge } : {}) } : p))
      );
      setEditingPolicy(null);
      toast.success("Retention policy updated");
    }
  }

  async function runPurge(dataType: string) {
    setPurging(dataType);
    try {
      const res = await fetch("/api/privacy/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_type: dataType }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(`Purged ${d.purged} records`);
        fetchAll();
      }
    } finally {
      setPurging(null);
    }
  }

  async function processDeletion(id: string) {
    setProcessing(id);
    try {
      const res = await fetch("/api/privacy/delete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        toast.success("Deletion request processed");
        fetchAll();
      }
    } finally {
      setProcessing(null);
    }
  }

  async function exportData(contactId?: string) {
    const url = contactId ? `/api/privacy/export?contact_id=${contactId}` : "/api/privacy/export";
    window.open(url, "_blank");
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-40 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" /> Privacy & Compliance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage data retention, GDPR data exports, and deletion requests.
        </p>
      </div>

      {/* Data Export */}
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" /> Data Export (GDPR Art. 20)
        </h2>
        <p className="text-xs text-muted-foreground">
          Export all personal data as JSON. Includes contacts, deals, notes, consent records, and activity logs.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => exportData()}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export My Data
          </Button>
        </div>
      </div>

      {/* Data Retention Policies */}
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Data Retention Policies
        </h2>
        <p className="text-xs text-muted-foreground">
          Configure how long each data type is retained. Auto-purge runs during scheduled cleanup.
        </p>

        <div className="space-y-2">
          {policies.map((policy) => (
            <div key={policy.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5">
              <Database className="h-4 w-4 text-muted-foreground shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {DATA_TYPE_LABELS[policy.data_type] ?? policy.data_type}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {counts[policy.data_type] ?? 0} records
                  {policy.last_purged_at && <> · Last purged {new Date(policy.last_purged_at).toLocaleDateString()}</>}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {editingPolicy === policy.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={editDays}
                      onChange={(e) => setEditDays(e.target.value)}
                      className="w-20 h-7 text-xs"
                      type="number"
                      min={1}
                    />
                    <span className="text-[10px] text-muted-foreground">days</span>
                    <Button
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => updatePolicy(policy.id, parseInt(editDays) || policy.retention_days)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingPolicy(policy.id); setEditDays(String(policy.retention_days)); }}
                    className="text-xs text-muted-foreground hover:text-foreground font-mono"
                  >
                    {policy.retention_days}d
                  </button>
                )}

                <button
                  onClick={() => updatePolicy(policy.id, policy.retention_days, !policy.auto_purge)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[9px] font-medium transition-colors",
                    policy.auto_purge
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-white/5 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {policy.auto_purge ? "Auto" : "Manual"}
                </button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={purging === policy.data_type}
                  onClick={() => runPurge(policy.data_type)}
                >
                  {purging === policy.data_type ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deletion Requests */}
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" /> Deletion Requests (GDPR Art. 17)
        </h2>
        <p className="text-xs text-muted-foreground">
          Right to erasure requests. Process pending requests to permanently delete personal data.
        </p>

        {deletionRequests.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 py-2">No deletion requests.</p>
        ) : (
          <div className="space-y-1.5">
            {deletionRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {req.target_type === "contact" ? `Contact ${req.target_id?.slice(0, 8)}...` : "User Data"}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString()}
                    {req.completed_at && <> · Completed {new Date(req.completed_at).toLocaleDateString()}</>}
                  </p>
                </div>

                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-medium",
                    req.status === "completed" && "bg-emerald-500/20 text-emerald-400",
                    req.status === "pending" && "bg-amber-500/20 text-amber-400",
                    req.status === "processing" && "bg-blue-500/20 text-blue-400",
                    req.status === "failed" && "bg-red-500/20 text-red-400"
                  )}
                >
                  {req.status}
                </span>

                {req.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={processing === req.id}
                    onClick={() => processDeletion(req.id)}
                  >
                    {processing === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Process"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
        <h3 className="text-xs font-medium text-primary">Data Privacy Summary</h3>
        <ul className="text-[10px] text-muted-foreground space-y-1">
          <li>• <strong>Encryption</strong>: AES-256-GCM for stored tokens, SHA-256 for phone number hashes</li>
          <li>• <strong>Access Control</strong>: Row-level security on private contacts, email connections, and audit logs</li>
          <li>• <strong>Data Minimization</strong>: Phone numbers stored as hash + last 4 digits, IPs hashed in tracking</li>
          <li>• <strong>Session Security</strong>: Telegram sessions encrypted at rest, auto-expire after inactivity</li>
          <li>• <strong>Shared Database</strong>: CRM tables prefixed (crm_, tg_) and isolated from other services</li>
        </ul>
      </div>
    </div>
  );
}
