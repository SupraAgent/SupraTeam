"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Tag, Plus, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EmailTag {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  is_system: boolean;
}

interface ThreadTag {
  id: string;
  tag_id: string;
  auto_tagged: boolean;
  crm_email_tags: EmailTag | null;
}

interface EmailTagsPanelProps {
  /** Thread ID to tag */
  threadId: string | null;
}

export function EmailTagsPanel({ threadId }: EmailTagsPanelProps) {
  const [allTags, setAllTags] = React.useState<EmailTag[]>([]);
  const [threadTags, setThreadTags] = React.useState<ThreadTag[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [applying, setApplying] = React.useState<string | null>(null);
  const [newTagName, setNewTagName] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);

  // Fetch all tags
  React.useEffect(() => {
    fetch("/api/email/tags")
      .then((r) => r.json())
      .then((json) => setAllTags(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch thread tags when threadId changes
  React.useEffect(() => {
    if (!threadId) {
      setThreadTags([]);
      return;
    }

    fetch(`/api/email/threads/${threadId}/tags`)
      .then((r) => r.json())
      .then((json) => setThreadTags(json.data ?? []))
      .catch(() => {});
  }, [threadId]);

  const appliedTagIds = new Set(threadTags.map((t) => t.tag_id));

  async function handleToggleTag(tagId: string) {
    if (!threadId) return;
    setApplying(tagId);

    try {
      if (appliedTagIds.has(tagId)) {
        // Remove tag
        await fetch(`/api/email/threads/${threadId}/tags?tagId=${tagId}`, { method: "DELETE" });
        setThreadTags((prev) => prev.filter((t) => t.tag_id !== tagId));
      } else {
        // Add tag
        const res = await fetch(`/api/email/threads/${threadId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag_id: tagId }),
        });
        const json = await res.json();
        if (json.data) {
          setThreadTags((prev) => [...prev, json.data]);
        }
      }
    } catch {
      toast.error("Failed to update tag");
    } finally {
      setApplying(null);
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;

    try {
      const res = await fetch("/api/email/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      const json = await res.json();
      if (json.data) {
        setAllTags((prev) => [...prev, json.data]);
        setNewTagName("");
        setShowCreate(false);
        toast("Tag created");
      } else {
        toast.error(json.error ?? "Failed to create tag");
      }
    } catch {
      toast.error("Failed to create tag");
    }
  }

  if (!threadId) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
        <Tag className="h-8 w-8 opacity-20" />
        <p className="text-xs">Select a thread to manage tags</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Applied tags */}
      {threadTags.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Applied
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {threadTags.map((tt) => {
              const tag = tt.crm_email_tags;
              if (!tag) return null;
              return (
                <span
                  key={tt.id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border border-white/10"
                  style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                >
                  {tag.name}
                  {tt.auto_tagged && (
                    <span className="text-[8px] opacity-60">auto</span>
                  )}
                  <button
                    onClick={() => handleToggleTag(tag.id)}
                    className="ml-0.5 hover:opacity-70 transition"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Available tags */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          {threadTags.length > 0 ? "Add More" : "Tags"}
        </h4>
        <div className="flex flex-wrap gap-1">
          {allTags.map((tag) => {
            const isApplied = appliedTagIds.has(tag.id);
            const isLoading = applying === tag.id;
            return (
              <button
                key={tag.id}
                onClick={() => handleToggleTag(tag.id)}
                disabled={isLoading}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition border",
                  isApplied
                    ? "border-white/20 opacity-40"
                    : "border-white/10 hover:border-white/20 hover:bg-white/5"
                )}
                style={{ color: tag.color }}
              >
                {isLoading ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : isApplied ? (
                  <Check className="h-2.5 w-2.5" />
                ) : (
                  <Plus className="h-2.5 w-2.5" />
                )}
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Create new tag */}
      {showCreate ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
            placeholder="Tag name..."
            className="flex-1 rounded-lg px-2 py-1 text-xs bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            autoFocus
          />
          <button
            onClick={handleCreateTag}
            className="rounded p-1 text-primary hover:bg-primary/10 transition"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewTagName(""); }}
            className="rounded p-1 text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition"
        >
          <Plus className="h-3 w-3" />
          Create Tag
        </button>
      )}
    </div>
  );
}
