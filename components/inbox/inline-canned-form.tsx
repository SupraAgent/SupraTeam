"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, X } from "lucide-react";
import { toast } from "sonner";

interface InlineCannedFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function InlineCannedForm({ onCreated, onCancel }: InlineCannedFormProps) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [shortcut, setShortcut] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inbox/canned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          shortcut: shortcut.trim() || null,
          category: null,
        }),
      });

      if (res.ok) {
        toast.success("Canned response created");
        onCreated();
      } else {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 space-y-2 border-t border-white/10 bg-white/[0.02]">
      <p className="text-[10px] font-medium text-foreground">New canned response</p>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Meeting Follow Up)"
        className="h-7 text-xs"
        autoFocus
      />
      <div className="flex gap-2">
        <Input
          value={shortcut}
          onChange={(e) => setShortcut(e.target.value)}
          placeholder="Shortcut (optional)"
          className="h-7 text-xs w-1/3"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message body..."
          className="flex-1 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
          rows={2}
        />
      </div>
      <div className="flex items-center gap-1.5 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-6 px-2 text-[10px]">
          <X className="mr-0.5 h-3 w-3" />
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !title.trim() || !body.trim()} className="h-6 px-2 text-[10px]">
          <Save className="mr-0.5 h-3 w-3" />
          {saving ? "Saving..." : "Create"}
        </Button>
      </div>
    </div>
  );
}
