"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Save, X, Zap } from "lucide-react";
import { toast } from "sonner";

interface CannedResponse {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  category: string | null;
  usage_count: number;
  created_at: string;
}

export default function CannedResponsesPage() {
  const [responses, setResponses] = React.useState<CannedResponse[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  // Form state
  const [formTitle, setFormTitle] = React.useState("");
  const [formBody, setFormBody] = React.useState("");
  const [formShortcut, setFormShortcut] = React.useState("");
  const [formCategory, setFormCategory] = React.useState("");

  const fetchResponses = React.useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/canned");
      if (res.ok) {
        const data = await res.json();
        setResponses(data.responses ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setFormTitle("");
    setFormBody("");
    setFormShortcut("");
    setFormCategory("");
  }

  function startEdit(r: CannedResponse) {
    setEditing(r.id);
    setCreating(false);
    setFormTitle(r.title);
    setFormBody(r.body);
    setFormShortcut(r.shortcut ?? "");
    setFormCategory(r.category ?? "");
  }

  function cancelForm() {
    setEditing(null);
    setCreating(false);
  }

  async function handleSave() {
    if (!formTitle.trim() || !formBody.trim()) {
      toast.error("Title and body are required");
      return;
    }

    const payload = {
      ...(editing ? { id: editing } : {}),
      title: formTitle.trim(),
      body: formBody.trim(),
      shortcut: formShortcut.trim() || null,
      category: formCategory.trim() || null,
    };

    try {
      const res = await fetch("/api/inbox/canned", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editing ? "Updated" : "Created");
        cancelForm();
        fetchResponses();
      } else {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this canned response?")) return;
    try {
      const res = await fetch(`/api/inbox/canned?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Deleted");
        setResponses((prev) => prev.filter((r) => r.id !== id));
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Network error");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Canned Responses</h2>
          <p className="text-sm text-muted-foreground">
            Quick replies accessible via <kbd className="px-1 py-0.5 rounded bg-white/10 text-[10px]">/</kbd> in the inbox composer.
            Use merge variables: <code className="text-[10px]">{"{{deal_name}}"}</code>, <code className="text-[10px]">{"{{contact_name}}"}</code>, <code className="text-[10px]">{"{{stage}}"}</code>, <code className="text-[10px]">{"{{board_type}}"}</code>
          </p>
        </div>
        <Button size="sm" onClick={startCreate} disabled={creating}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Response
        </Button>
      </div>

      {/* Create / Edit form */}
      {(creating || editing) && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">{editing ? "Edit Response" : "New Response"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Title *</label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Meeting Follow Up" className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">Shortcut</label>
                <Input value={formShortcut} onChange={(e) => setFormShortcut(e.target.value)} placeholder="e.g. followup" className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">Category</label>
                <Input value={formCategory} onChange={(e) => setFormCategory(e.target.value)} placeholder="e.g. Sales" className="h-8 text-sm" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Body *</label>
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              placeholder="Hi {{contact_name}}, thanks for your interest in..."
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[80px]"
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {editing ? "Update" : "Create"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelForm}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Response list */}
      {responses.length === 0 && !creating ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <Zap className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No canned responses yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
          {responses.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground">{r.title}</span>
                  {r.shortcut && (
                    <span className="text-[10px] text-muted-foreground bg-white/5 rounded px-1.5 py-0.5">/{r.shortcut}</span>
                  )}
                  {r.category && (
                    <span className="text-[10px] text-primary/60 bg-primary/5 rounded px-1.5 py-0.5">{r.category}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
                    {r.usage_count} use{r.usage_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{r.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startEdit(r)}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
