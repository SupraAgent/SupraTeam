"use client";

import * as React from "react";
import {
  Plus,
  QrCode,
  Copy,
  Check,
  Power,
  PowerOff,
  Loader2,
  ScanLine,
  ArrowRightLeft,
  Trash2,
  Calendar,
  Tag,
  MapPin,
} from "lucide-react";
import { QrDisplay } from "@/components/qr-code/qr-display";

// ── Types ────────────────────────────────────────────────────────

interface PipelineStage {
  id: string;
  name: string;
  position: number;
}

interface TeamMember {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface QrCodeRecord {
  id: string;
  name: string;
  campaign: string | null;
  source: string | null;
  pipeline_stage_id: string | null;
  assigned_to: string | null;
  custom_fields: Record<string, unknown>;
  redirect_url: string | null;
  scan_count: number;
  conversion_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  deep_link?: string;
  stage?: { id: string; name: string } | null;
}

// ── Component ────────────────────────────────────────────────────

export default function QrCodesPage() {
  const [qrCodes, setQrCodes] = React.useState<QrCodeRecord[]>([]);
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [team, setTeam] = React.useState<TeamMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [selectedQr, setSelectedQr] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Form state
  const [formName, setFormName] = React.useState("");
  const [formCampaign, setFormCampaign] = React.useState("");
  const [formSource, setFormSource] = React.useState("");
  const [formStageId, setFormStageId] = React.useState("");
  const [formAssignedTo, setFormAssignedTo] = React.useState("");
  const [formRedirectUrl, setFormRedirectUrl] = React.useState("");
  const [formExpiresAt, setFormExpiresAt] = React.useState("");

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [qrRes, stagesRes, teamRes] = await Promise.all([
        fetch("/api/qr-codes"),
        fetch("/api/pipeline"),
        fetch("/api/team"),
      ]);

      if (qrRes.ok) {
        const qrJson = await qrRes.json();
        setQrCodes(qrJson.data ?? []);
      }
      if (stagesRes.ok) {
        const stagesJson = await stagesRes.json();
        const allStages = stagesJson.stages ?? stagesJson.data ?? [];
        setStages(allStages.sort((a: PipelineStage, b: PipelineStage) => a.position - b.position));
      }
      if (teamRes.ok) {
        const teamJson = await teamRes.json();
        setTeam(teamJson.members ?? teamJson.data ?? []);
      }
    } catch {
      // Silently fail — empty state will show
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setFormName("");
    setFormCampaign("");
    setFormSource("");
    setFormStageId("");
    setFormAssignedTo("");
    setFormRedirectUrl("");
    setFormExpiresAt("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/qr-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          campaign: formCampaign.trim() || null,
          source: formSource.trim() || null,
          pipeline_stage_id: formStageId || null,
          assigned_to: formAssignedTo || null,
          redirect_url: formRedirectUrl.trim() || null,
          expires_at: formExpiresAt || null,
        }),
      });

      if (res.ok) {
        resetForm();
        setShowForm(false);
        fetchData();
      }
    } catch {
      // Error handling
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (qr: QrCodeRecord) => {
    try {
      await fetch("/api/qr-codes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: qr.id, is_active: !qr.is_active }),
      });
      fetchData();
    } catch {
      // Error handling
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/qr-codes?id=${id}`, { method: "DELETE" });
      fetchData();
    } catch {
      // Error handling
    }
  };

  const handleCopyLink = async (qr: QrCodeRecord) => {
    const link = qr.deep_link ?? `https://t.me/bot?start=qr_${qr.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(qr.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const getBotDeepLink = (qr: QrCodeRecord) =>
    qr.deep_link ?? `qr_${qr.id}`;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <QrCode className="h-5 w-5 text-blue-400" />
            QR Code Lead Capture
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate QR codes that deep-link to the TMA apply flow. Scan at event booth, opens Telegram, starts qualification.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
          New QR Code
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-foreground">Create QR Code</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. ETH Denver 2026 Booth"
                className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Campaign / Event
              </label>
              <input
                type="text"
                value={formCampaign}
                onChange={(e) => setFormCampaign(e.target.value)}
                placeholder="e.g. ETH Denver 2026"
                className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Source / Location
              </label>
              <input
                type="text"
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                placeholder="e.g. Main Booth, Side Stage"
                className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Pipeline Stage
              </label>
              <select
                value={formStageId}
                onChange={(e) => setFormStageId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Default (first stage)</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Assign To
              </label>
              <select
                value={formAssignedTo}
                onChange={(e) => setFormAssignedTo(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Auto-assign</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Expires At
              </label>
              <input
                type="datetime-local"
                value={formExpiresAt}
                onChange={(e) => setFormExpiresAt(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Custom Redirect URL (optional — overrides default TMA apply flow)
              </label>
              <input
                type="url"
                value={formRedirectUrl}
                onChange={(e) => setFormRedirectUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={creating || !formName.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create QR Code
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* QR Code list */}
      {qrCodes.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <QrCode className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No QR codes yet</p>
          <p className="text-xs text-muted-foreground/60">
            Create your first QR code to start capturing leads at events.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {qrCodes.map((qr) => (
            <div
              key={qr.id}
              className={`rounded-xl border bg-white/[0.02] p-5 transition-colors ${
                qr.is_active ? "border-white/10" : "border-white/5 opacity-60"
              } ${selectedQr === qr.id ? "ring-1 ring-blue-500/50" : ""}`}
            >
              <div className="flex gap-4">
                {/* QR Preview */}
                <div
                  className="shrink-0 cursor-pointer"
                  onClick={() => setSelectedQr(selectedQr === qr.id ? null : qr.id)}
                >
                  <QrDisplay
                    url={getBotDeepLink(qr)}
                    size={120}
                    showDownload={false}
                    className="rounded-lg"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {qr.name}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleActive(qr)}
                        title={qr.is_active ? "Deactivate" : "Activate"}
                        className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                      >
                        {qr.is_active ? (
                          <Power className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <PowerOff className="h-3.5 w-3.5 text-red-400" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(qr.id)}
                        title="Delete"
                        className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {qr.campaign && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                        <Tag className="h-3 w-3" />
                        {qr.campaign}
                      </span>
                    )}
                    {qr.source && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
                        <MapPin className="h-3 w-3" />
                        {qr.source}
                      </span>
                    )}
                    {qr.stage && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                        {qr.stage.name}
                      </span>
                    )}
                    {qr.expires_at && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                        <Calendar className="h-3 w-3" />
                        {new Date(qr.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <ScanLine className="h-3.5 w-3.5" />
                      {qr.scan_count} scans
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      {qr.conversion_count ?? 0} conversions
                    </span>
                    {qr.scan_count > 0 && (
                      <span className="text-blue-400">
                        {Math.round(((qr.conversion_count ?? 0) / qr.scan_count) * 100)}% rate
                      </span>
                    )}
                  </div>

                  {/* Deep link */}
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] text-muted-foreground/80 truncate flex-1">
                      {getBotDeepLink(qr)}
                    </code>
                    <button
                      onClick={() => handleCopyLink(qr)}
                      className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                      title="Copy deep link"
                    >
                      {copiedId === qr.id ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded: full QR with download */}
              {selectedQr === qr.id && (
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-center">
                  <QrDisplay url={getBotDeepLink(qr)} size={250} showDownload />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
