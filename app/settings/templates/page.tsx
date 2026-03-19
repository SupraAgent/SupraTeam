"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Template = {
  id: string;
  template_key: string;
  name: string;
  body_template: string;
  description: string | null;
  is_active: boolean;
  updated_at: string;
};

export default function TemplateSettingsPage() {
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

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
        toast.success("Template saved");
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
      <div>
        <h1 className="text-xl font-semibold text-foreground">Bot Message Templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize the messages the bot sends for stage changes, daily digests, and broadcasts.
          Use <code className="text-xs bg-white/5 px-1 py-0.5 rounded">{"{{variable}}"}</code> placeholders.
        </p>
      </div>

      {templates.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No templates found. Run the migration to seed defaults.
          </p>
        </div>
      )}

      {templates.map((tpl) => (
        <div
          key={tpl.id}
          className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-foreground">{tpl.name}</h2>
              <p className="text-xs text-muted-foreground font-mono">{tpl.template_key}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleActive(tpl)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  tpl.is_active
                    ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10"
                }`}
              >
                {tpl.is_active ? "Active" : "Disabled"}
              </button>
            </div>
          </div>

          {tpl.description && (
            <p className="text-xs text-muted-foreground">{tpl.description}</p>
          )}

          {editing === tpl.template_key ? (
            <div className="space-y-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={8}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveTemplate(tpl.template_key)} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <pre className="rounded-xl bg-white/[0.03] border border-white/5 p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">
                {tpl.body_template}
              </pre>
              <Button size="sm" variant="ghost" onClick={() => startEdit(tpl)}>
                Edit Template
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
