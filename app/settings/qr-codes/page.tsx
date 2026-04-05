"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import {
  QrCode,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  Users,
  Bot,
  Pause,
  Play,
  ScanLine,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineStage } from "@/lib/types";

interface AutoAddMember {
  type: "person" | "bot";
  id: string;
  label: string;
}

interface QrCodeRecord {
  id: string;
  name: string;
  type: "personal" | "company";
  bot_id: string;
  bot?: { id: string; label: string; bot_username: string | null } | null;
  auto_create_group: boolean;
  group_name_template: string;
  welcome_message: string | null;
  auto_add_members: AutoAddMember[];
  auto_create_deal: boolean;
  deal_stage_id: string | null;
  deal_board_type: string | null;
  campaign_source: string | null;
  slug_tags: string[];
  max_scans: number | null;
  expires_at: string | null;
  is_active: boolean;
  scan_count: number;
  created_at: string;
}

interface BotRecord {
  id: string;
  label: string;
  bot_username: string | null;
  is_active: boolean;
}

interface TeamMember {
  id: string;
  display_name: string | null;
  crm_role: string | null;
}

export default function QrCodesSettingsPage() {
  const [qrCodes, setQrCodes] = React.useState<QrCodeRecord[]>([]);
  const [bots, setBots] = React.useState<BotRecord[]>([]);
  const [team, setTeam] = React.useState<TeamMember[]>([]);
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  async function fetchAll() {
    setLoading(true);
    try {
      const [qrRes, botsRes, teamRes, stagesRes] = await Promise.all([
        fetch("/api/qr-codes"),
        fetch("/api/bots"),
        fetch("/api/team"),
        fetch("/api/pipeline"),
      ]);
      const [qrData, botsData, teamData, stagesData] = await Promise.all([
        qrRes.json(),
        botsRes.json(),
        teamRes.json(),
        stagesRes.json(),
      ]);
      setQrCodes(qrData.data ?? []);
      setBots((botsData.data ?? []).filter((b: BotRecord) => b.is_active));
      setTeam(teamData.data ?? []);
      setStages(stagesData.stages ?? []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchAll(); }, []);

  async function handleToggleActive(qr: QrCodeRecord) {
    await fetch(`/api/qr-codes/${qr.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !qr.is_active }),
    });
    await fetchAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this QR code? Scan history will be lost.")) return;
    await fetch(`/api/qr-codes/${id}`, { method: "DELETE" });
    toast.success("QR code deleted");
    await fetchAll();
  }

  function getDeeplink(qr: QrCodeRecord) {
    const username = qr.bot?.bot_username;
    if (!username) return null;
    return `https://t.me/${username}?start=qr_${qr.id.replace(/-/g, "")}`;
  }

  function copyDeeplink(qr: QrCodeRecord) {
    const link = getDeeplink(qr);
    if (link) {
      navigator.clipboard.writeText(link);
      toast.success("Deeplink copied");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">QR Codes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create QR codes that auto-create Telegram groups with your team when scanned.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={bots.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Create QR Code
        </Button>
      </div>

      {/* No bots warning */}
      {!loading && bots.length === 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 text-sm text-amber-400">
          You need at least one active bot to create QR codes.{" "}
          <a href="/settings/integrations/telegram" className="underline">Add a bot</a> first.
        </div>
      )}

      {/* QR Code list */}
      {loading && qrCodes.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      )}

      {!loading && qrCodes.length === 0 && bots.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center space-y-2">
          <QrCode className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No QR codes yet. Create one to start capturing leads via Telegram.</p>
        </div>
      )}

      <div className="space-y-3">
        {qrCodes.map((qr) => {
          const isExpanded = expandedId === qr.id;
          const deeplink = getDeeplink(qr);

          return (
            <div
              key={qr.id}
              className={cn(
                "rounded-2xl border bg-white/[0.035] p-4 transition-colors",
                qr.is_active ? "border-white/10" : "border-white/5 opacity-50"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                    qr.type === "company" ? "bg-primary/10" : "bg-emerald-500/10"
                  )}>
                    <QrCode className={cn("h-5 w-5", qr.type === "company" ? "text-primary" : "text-emerald-400")} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{qr.name}</p>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
                        qr.type === "company" ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-400"
                      )}>
                        {qr.type}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      @{qr.bot?.bot_username ?? "unknown"} · {qr.scan_count} scan{qr.scan_count !== 1 ? "s" : ""}
                      {qr.auto_add_members.length > 0 && ` · ${qr.auto_add_members.length} auto-add`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Copy deeplink" onClick={() => copyDeeplink(qr)}>
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title={qr.is_active ? "Pause" : "Activate"}
                    onClick={() => handleToggleActive(qr)}
                  >
                    {qr.is_active ? <Pause className="h-3.5 w-3.5 text-emerald-400" /> : <Play className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setExpandedId(isExpanded ? null : qr.id)}
                  >
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                    onClick={() => handleDelete(qr.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Group template</span>
                      <p className="text-foreground font-mono text-[11px]">{qr.group_name_template}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Campaign source</span>
                      <p className="text-foreground">{qr.campaign_source || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Auto-create deal</span>
                      <p className="text-foreground">{qr.auto_create_deal ? "Yes" : "No"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Max scans</span>
                      <p className="text-foreground">{qr.max_scans ?? "Unlimited"}</p>
                    </div>
                  </div>

                  {/* Auto-add members list */}
                  {qr.auto_add_members.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Auto-add to group</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {qr.auto_add_members.map((m, i) => (
                          <span
                            key={i}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                              m.type === "bot" ? "bg-[#2AABEE]/10 text-[#2AABEE]" : "bg-white/10 text-foreground"
                            )}
                          >
                            {m.type === "bot" ? <Bot className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                            {m.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Welcome message */}
                  {qr.welcome_message && (
                    <div>
                      <span className="text-xs text-muted-foreground">Welcome message</span>
                      <p className="text-xs text-foreground/80 mt-1 bg-white/[0.03] rounded-lg p-2 whitespace-pre-wrap">{qr.welcome_message}</p>
                    </div>
                  )}

                  {/* Deeplink */}
                  {deeplink && (
                    <div>
                      <span className="text-xs text-muted-foreground">Deeplink</span>
                      <p className="text-[11px] text-primary font-mono mt-0.5 break-all">{deeplink}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      <CreateQrModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); fetchAll(); }}
        bots={bots}
        team={team}
        stages={stages}
      />
    </div>
  );
}

/* ─── Create QR Code Modal ─── */

interface CreateQrModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  bots: BotRecord[];
  team: TeamMember[];
  stages: PipelineStage[];
}

function CreateQrModal({ open, onClose, onCreated, bots, team, stages }: CreateQrModalProps) {
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<"personal" | "company">("personal");
  const [botId, setBotId] = React.useState("");
  const [groupTemplate, setGroupTemplate] = React.useState("{contact_name} × {company}");
  const [welcomeMessage, setWelcomeMessage] = React.useState("");
  const [autoAddMembers, setAutoAddMembers] = React.useState<AutoAddMember[]>([]);
  const [autoCreateDeal, setAutoCreateDeal] = React.useState(false);
  const [dealStageId, setDealStageId] = React.useState("");
  const [dealBoardType, setDealBoardType] = React.useState("");
  const [campaignSource, setCampaignSource] = React.useState("");
  const [maxScans, setMaxScans] = React.useState("");
  const [showMemberPicker, setShowMemberPicker] = React.useState(false);

  // Set default bot
  React.useEffect(() => {
    if (open && bots.length > 0 && !botId) {
      setBotId(bots[0].id);
    }
  }, [open, bots, botId]);

  function addMember(memberType: "person" | "bot", id: string, label: string) {
    if (autoAddMembers.some((m) => m.id === id)) return;
    setAutoAddMembers((prev) => [...prev, { type: memberType, id, label }]);
    setShowMemberPicker(false);
  }

  function removeMember(id: string) {
    setAutoAddMembers((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !botId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/qr-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          bot_id: botId,
          group_name_template: groupTemplate,
          welcome_message: welcomeMessage || null,
          auto_add_members: autoAddMembers,
          auto_create_deal: autoCreateDeal,
          deal_stage_id: dealStageId || null,
          deal_board_type: dealBoardType || null,
          campaign_source: campaignSource || null,
          max_scans: maxScans ? parseInt(maxScans, 10) : null,
        }),
      });
      if (res.ok) {
        toast.success("QR code created");
        // Reset form
        setName(""); setType("personal"); setBotId(bots[0]?.id ?? "");
        setGroupTemplate("{contact_name} × {company}"); setWelcomeMessage("");
        setAutoAddMembers([]); setAutoCreateDeal(false); setDealStageId("");
        setDealBoardType(""); setCampaignSource(""); setMaxScans("");
        onCreated();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to create QR code");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create QR Code" className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Basic info */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Conference Dubai 2026"' className="mt-1" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as "personal" | "company")}
              options={[
                { value: "personal", label: "Personal" },
                { value: "company", label: "Company" },
              ]}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Creator Bot *</label>
            <Select
              value={botId}
              onChange={(e) => setBotId(e.target.value)}
              options={bots.map((b) => ({
                value: b.id,
                label: `${b.label}${b.bot_username ? ` (@${b.bot_username})` : ""}`,
              }))}
              className="mt-1"
            />
          </div>
        </div>

        {/* Group config */}
        <div className="space-y-3 pt-1 border-t border-white/10">
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider pt-2">Group Settings</p>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Group name template</label>
            <Input
              value={groupTemplate}
              onChange={(e) => setGroupTemplate(e.target.value)}
              placeholder="{contact_name} × {company}"
              className="mt-1 font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground/50 mt-1">
              Variables: {"{contact_name}"}, {"{company}"}, {"{qr_name}"}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Welcome message</label>
            <Textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Welcome! We're excited to connect..."
              className="mt-1 min-h-[60px]"
            />
          </div>
        </div>

        {/* Auto-add members */}
        <div className="space-y-3 pt-1 border-t border-white/10">
          <div className="flex items-center justify-between pt-2">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Auto-add to group</p>
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowMemberPicker(!showMemberPicker)}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>

          {/* Current members */}
          {autoAddMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {autoAddMembers.map((m) => (
                <span
                  key={m.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                    m.type === "bot" ? "bg-[#2AABEE]/10 text-[#2AABEE]" : "bg-white/10 text-foreground"
                  )}
                >
                  {m.type === "bot" ? <Bot className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  {m.label}
                  <button type="button" onClick={() => removeMember(m.id)} className="ml-0.5 hover:text-red-400">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {autoAddMembers.length === 0 && !showMemberPicker && (
            <p className="text-xs text-muted-foreground/50">No members added. Only the creator bot will be in the group.</p>
          )}

          {/* Member picker dropdown */}
          {showMemberPicker && (
            <div className="rounded-xl border border-white/10 bg-[hsl(var(--background))] p-2 space-y-1 max-h-48 overflow-y-auto">
              {/* Bots section */}
              {bots.filter((b) => !autoAddMembers.some((m) => m.id === b.id)).length > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground/50 uppercase px-2 pt-1">Bots</p>
                  {bots
                    .filter((b) => !autoAddMembers.some((m) => m.id === b.id))
                    .map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-white/[0.05] flex items-center gap-2"
                        onClick={() => addMember("bot", b.id, b.label)}
                      >
                        <Bot className="h-3.5 w-3.5 text-[#2AABEE]" />
                        <span>{b.label}</span>
                        {b.bot_username && <span className="text-muted-foreground">@{b.bot_username}</span>}
                      </button>
                    ))}
                </>
              )}
              {/* Team section */}
              {team.filter((t) => !autoAddMembers.some((m) => m.id === t.id)).length > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground/50 uppercase px-2 pt-1">Team Members</p>
                  {team
                    .filter((t) => !autoAddMembers.some((m) => m.id === t.id))
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-white/[0.05] flex items-center gap-2"
                        onClick={() => addMember("person", t.id, t.display_name ?? "Unknown")}
                      >
                        <Users className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{t.display_name ?? "Unknown"}</span>
                        {t.crm_role && (
                          <span className="text-[10px] text-muted-foreground/50">
                            {t.crm_role.replace("_lead", "")}
                          </span>
                        )}
                      </button>
                    ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Pipeline integration */}
        <div className="space-y-3 pt-1 border-t border-white/10">
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider pt-2">Pipeline</p>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoCreateDeal}
              onChange={(e) => setAutoCreateDeal(e.target.checked)}
              className="rounded border-white/20"
            />
            <span className="text-foreground">Auto-create deal on scan</span>
          </label>

          {autoCreateDeal && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Deal stage</label>
                <Select
                  value={dealStageId}
                  onChange={(e) => setDealStageId(e.target.value)}
                  options={stages.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="Select stage"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Board</label>
                <Select
                  value={dealBoardType}
                  onChange={(e) => setDealBoardType(e.target.value)}
                  options={[
                    { value: "bd", label: "BD" },
                    { value: "marketing", label: "Marketing" },
                    { value: "admin", label: "Admin" },
                  ]}
                  placeholder="Select board"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Campaign source</label>
            <Input
              value={campaignSource}
              onChange={(e) => setCampaignSource(e.target.value)}
              placeholder='e.g. "dubai-conf-2026"'
              className="mt-1"
            />
          </div>
        </div>

        {/* Limits */}
        <div className="space-y-3 pt-1 border-t border-white/10">
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider pt-2">Limits</p>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Max scans (leave empty for unlimited)</label>
            <Input
              type="number"
              value={maxScans}
              onChange={(e) => setMaxScans(e.target.value)}
              placeholder="Unlimited"
              className="mt-1"
              min={1}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim() || !botId}>
            {saving ? "Creating..." : "Create QR Code"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
