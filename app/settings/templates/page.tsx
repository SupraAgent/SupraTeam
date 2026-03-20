"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Eye,
  EyeOff,
  History,
  Plus,
  RotateCcw,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Code,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { toast } from "sonner";

type Template = {
  id: string;
  template_key: string;
  name: string;
  body_template: string;
  description: string | null;
  is_active: boolean;
  available_variables: string[] | null;
  category: string | null;
  updated_at: string;
};

type TemplateVersion = {
  id: string;
  template_key: string;
  body_template: string;
  version_number: number;
  change_note: string | null;
  created_at: string;
};

// Sample data for preview rendering
const PREVIEW_DATA: Record<string, Record<string, string>> = {
  stage_change: {
    deal_name: "Acme Corp Partnership",
    from_stage: "Outreach",
    to_stage: "Video Call",
    board_type: "BD",
    changed_by: "Jon",
  },
  daily_digest: {
    total_deals: "24",
    board_summary: "  BD: 15\n  Marketing: 7\n  Admin: 2",
    board_summary_html: "  BD: 15\n  Marketing: 7\n  Admin: 2",
    stage_summary: "  Potential Client: 5\n  Outreach: 8\n  Video Call: 4",
    stage_summary_html: "  Potential Client: 5\n  Outreach: 8\n  Video Call: 4",
    moves_today: "3",
    top_deals_section: "<b>Top Deals</b>\n  Acme Corp — Video Call ($50,000)",
    top_deals_section_html: "<b>Top Deals</b>\n  Acme Corp — Video Call ($50,000)",
  },
  broadcast: {
    message: "Team sync moved to 3pm. Please update your calendars.",
    sender_name: "Jon",
  },
  welcome_group: {},
};

function renderPreview(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
}

export default function TemplateSettingsPage() {
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState<string | null>(null);
  const [showVersions, setShowVersions] = React.useState<string | null>(null);
  const [versions, setVersions] = React.useState<TemplateVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);

  // Create form
  const [newKey, setNewKey] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newBody, setNewBody] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [newVars, setNewVars] = React.useState("");

  React.useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const res = await fetch("/api/bot/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  function startEdit(tpl: Template) {
    setEditing(tpl.template_key);
    setEditValue(tpl.body_template);
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue("");
  }

  async function saveTemplate(templateKey: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/bot/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_key: templateKey, body_template: editValue }),
      });
      if (res.ok) {
        toast.success("Template saved (previous version archived)");
        setEditing(null);
        fetchTemplates();
      } else {
        toast.error("Failed to save template");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(tpl: Template) {
    const res = await fetch("/api/bot/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_key: tpl.template_key, is_active: !tpl.is_active }),
    });
    if (res.ok) {
      toast.success(tpl.is_active ? "Template disabled" : "Template enabled");
      fetchTemplates();
    }
  }

  async function fetchVersions(templateKey: string) {
    if (showVersions === templateKey) {
      setShowVersions(null);
      return;
    }
    setShowVersions(templateKey);
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/bot/templates/versions?key=${encodeURIComponent(templateKey)}`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions ?? []);
      }
    } finally {
      setVersionsLoading(false);
    }
  }

  function restoreVersion(version: TemplateVersion) {
    setEditing(version.template_key);
    setEditValue(version.body_template);
    setShowVersions(null);
    toast.success(`Version ${version.version_number} loaded — save to apply`);
  }

  async function handleCreate() {
    if (!newKey.trim() || !newName.trim() || !newBody.trim()) return;
    const res = await fetch("/api/bot/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_key: newKey.trim().toLowerCase().replace(/\s+/g, "_"),
        name: newName.trim(),
        body_template: newBody,
        description: newDesc || undefined,
        available_variables: newVars ? newVars.split(",").map((v) => v.trim()) : [],
        category: "custom",
      }),
    });
    if (res.ok) {
      toast.success("Template created");
      setShowCreate(false);
      setNewKey("");
      setNewName("");
      setNewBody("");
      setNewDesc("");
      setNewVars("");
      fetchTemplates();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to create");
    }
  }

  function insertVariable(variable: string) {
    setEditValue((prev) => prev + `{{${variable}}}`);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-foreground">Bot Message Templates</h1>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Bot Message Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customize the messages the bot sends. Use{" "}
            <code className="text-xs bg-white/5 px-1 py-0.5 rounded">{"{{variable}}"}</code>{" "}
            placeholders. All edits are versioned.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Template
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">New Custom Template</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="template_key (e.g. deal_won)"
              className="text-xs font-mono"
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name"
              className="text-xs"
            />
          </div>
          <Input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="text-xs"
          />
          <Input
            value={newVars}
            onChange={(e) => setNewVars(e.target.value)}
            placeholder="Variables (comma-separated): deal_name, stage, value"
            className="text-xs font-mono"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Template body with {{placeholders}}"
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs font-mono resize-y"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newKey.trim() || !newName.trim() || !newBody.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      )}

      {templates.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No templates found. Run the migration to seed defaults.
          </p>
        </div>
      )}

      {templates.map((tpl) => {
        const previewData = PREVIEW_DATA[tpl.template_key] ?? {};
        const isEditing = editing === tpl.template_key;
        const isPreviewing = showPreview === tpl.template_key;
        const isShowingVersions = showVersions === tpl.template_key;
        const vars = tpl.available_variables ?? [];

        return (
          <div
            key={tpl.id}
            className={cn(
              "rounded-2xl border bg-white/[0.035] p-5 space-y-3 transition-colors",
              tpl.is_active ? "border-white/10" : "border-white/5 opacity-60"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-foreground">{tpl.name}</h2>
                  {tpl.category && tpl.category !== "notification" && (
                    <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">
                      {tpl.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono">{tpl.template_key}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive(tpl)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    tpl.is_active
                      ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      : "bg-white/5 text-muted-foreground hover:bg-white/10"
                  )}
                >
                  {tpl.is_active ? "Active" : "Disabled"}
                </button>
              </div>
            </div>

            {tpl.description && (
              <p className="text-xs text-muted-foreground">{tpl.description}</p>
            )}

            {/* Variable chips */}
            {vars.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag className="h-3 w-3 text-muted-foreground" />
                {vars.map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      if (isEditing) insertVariable(v);
                    }}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[10px] font-mono transition-colors",
                      isEditing
                        ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                        : "border-white/10 bg-white/5 text-muted-foreground cursor-default"
                    )}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            )}

            {/* Editor / Preview / Static view */}
            {isEditing ? (
              <div className="space-y-2">
                {/* Editor toolbar */}
                <div className="flex items-center gap-1 border-b border-white/5 pb-2">
                  <button
                    onClick={() => {
                      const ta = document.querySelector<HTMLTextAreaElement>(`#editor-${tpl.template_key}`);
                      if (!ta) return;
                      const start = ta.selectionStart;
                      const end = ta.selectionEnd;
                      const selected = editValue.slice(start, end);
                      setEditValue(editValue.slice(0, start) + `<b>${selected}</b>` + editValue.slice(end));
                    }}
                    className="rounded px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-white/5 transition"
                  >
                    B
                  </button>
                  <button
                    onClick={() => {
                      const ta = document.querySelector<HTMLTextAreaElement>(`#editor-${tpl.template_key}`);
                      if (!ta) return;
                      const start = ta.selectionStart;
                      const end = ta.selectionEnd;
                      const selected = editValue.slice(start, end);
                      setEditValue(editValue.slice(0, start) + `<i>${selected}</i>` + editValue.slice(end));
                    }}
                    className="rounded px-2 py-1 text-xs italic text-muted-foreground hover:bg-white/5 transition"
                  >
                    I
                  </button>
                  <div className="h-4 w-px bg-white/10 mx-1" />
                  <button
                    onClick={() =>
                      setShowPreview(isPreviewing ? null : tpl.template_key)
                    }
                    className={cn(
                      "rounded px-2 py-1 text-xs flex items-center gap-1 transition",
                      isPreviewing
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    {isPreviewing ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    Preview
                  </button>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Click a variable chip to insert
                  </span>
                </div>

                {/* Split view: editor + preview */}
                <div className={cn("grid gap-3", isPreviewing ? "grid-cols-2" : "grid-cols-1")}>
                  <textarea
                    id={`editor-${tpl.template_key}`}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={8}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                  />
                  {isPreviewing && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                      <p className="text-[10px] text-blue-400 uppercase tracking-wider font-medium">
                        Telegram Preview
                      </p>
                      <div
                        className="text-xs text-foreground whitespace-pre-wrap font-sans"
                        dangerouslySetInnerHTML={{
                          __html: renderPreview(editValue, previewData)
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;")
                            .replace(/&lt;b&gt;/g, "<b>")
                            .replace(/&lt;\/b&gt;/g, "</b>")
                            .replace(/&lt;i&gt;/g, "<i>")
                            .replace(/&lt;\/i&gt;/g, "</i>")
                            .replace(/&lt;u&gt;/g, "<u>")
                            .replace(/&lt;\/u&gt;/g, "</u>")
                            .replace(/&lt;code&gt;/g, '<code class="bg-white/10 px-1 rounded text-[11px]">')
                            .replace(/&lt;\/code&gt;/g, "</code>"),
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveTemplate(tpl.template_key)} disabled={saving}>
                    <Save className="mr-1 h-3 w-3" />
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Static template with syntax coloring */}
                <pre className="rounded-xl bg-white/[0.03] border border-white/5 p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                  {tpl.body_template.split(/(\{\{\w+\}\})/).map((part, i) =>
                    part.match(/^\{\{\w+\}\}$/) ? (
                      <span key={i} className="text-primary bg-primary/10 rounded px-0.5">
                        {part}
                      </span>
                    ) : part.match(/^<\/?[a-z]+>$/i) ? (
                      <span key={i} className="text-blue-400">
                        {part}
                      </span>
                    ) : (
                      <span key={i} className="text-muted-foreground">
                        {part}
                      </span>
                    )
                  )}
                </pre>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(tpl)}>
                    <Code className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setShowPreview(isPreviewing ? null : tpl.template_key)
                    }
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fetchVersions(tpl.template_key)}
                  >
                    <History className="mr-1 h-3 w-3" />
                    Versions
                  </Button>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Updated {timeAgo(tpl.updated_at)}
                  </span>
                </div>

                {/* Static preview */}
                {isPreviewing && !isEditing && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                    <p className="text-[10px] text-blue-400 uppercase tracking-wider font-medium">
                      Telegram Preview (with sample data)
                    </p>
                    <div
                      className="text-xs text-foreground whitespace-pre-wrap font-sans"
                      dangerouslySetInnerHTML={{
                        __html: renderPreview(tpl.body_template, previewData)
                          .replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;")
                          .replace(/&lt;b&gt;/g, "<b>")
                          .replace(/&lt;\/b&gt;/g, "</b>")
                          .replace(/&lt;i&gt;/g, "<i>")
                          .replace(/&lt;\/i&gt;/g, "</i>")
                          .replace(/&lt;u&gt;/g, "<u>")
                          .replace(/&lt;\/u&gt;/g, "</u>")
                          .replace(/&lt;code&gt;/g, '<code class="bg-white/10 px-1 rounded text-[11px]">')
                          .replace(/&lt;\/code&gt;/g, "</code>"),
                      }}
                    />
                  </div>
                )}

                {/* Version history */}
                {isShowingVersions && (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Version History
                    </p>
                    {versionsLoading ? (
                      <p className="text-xs text-muted-foreground">Loading...</p>
                    ) : versions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No previous versions.</p>
                    ) : (
                      versions.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-start gap-3 border-b border-white/5 pb-2 last:border-0"
                        >
                          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground shrink-0">
                            v{v.version_number}
                          </span>
                          <div className="flex-1 min-w-0">
                            <pre className="text-[10px] font-mono text-muted-foreground/70 whitespace-pre-wrap max-h-20 overflow-hidden">
                              {v.body_template.length > 200
                                ? v.body_template.slice(0, 200) + "..."
                                : v.body_template}
                            </pre>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] text-muted-foreground/50">
                                {timeAgo(v.created_at)}
                              </span>
                              {v.change_note && (
                                <span className="text-[9px] text-muted-foreground">
                                  {v.change_note}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] shrink-0"
                            onClick={() => restoreVersion(v)}
                          >
                            <RotateCcw className="mr-1 h-2.5 w-2.5" />
                            Restore
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
