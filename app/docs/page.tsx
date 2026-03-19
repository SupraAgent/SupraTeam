"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

type DocLink = {
  entity_type: string;
  entity_id: string;
  entity_name?: string;
};

type Doc = {
  id: string;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  links: DocLink[];
};

type EntityOption = {
  id: string;
  name: string;
  type: "deal" | "contact" | "group";
};

export default function DocsPage() {
  const [docs, setDocs] = React.useState<Doc[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingDoc, setEditingDoc] = React.useState<Doc | null>(null);
  const [creating, setCreating] = React.useState(false);

  // Check URL for ?edit=id
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId) {
      fetch(`/api/docs/${editId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.doc) setEditingDoc(data.doc);
        });
    }
  }, []);

  const fetchDocs = React.useCallback(async () => {
    try {
      const res = await fetch("/api/docs");
      if (res.ok) {
        const data = await res.json();
        setDocs(data.docs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled", content: "" }),
      });
      if (res.ok) {
        const data = await res.json();
        const newDoc = { ...data.doc, links: [] };
        setDocs((prev) => [newDoc, ...prev]);
        setEditingDoc(newDoc);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/docs/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (editingDoc?.id === id) setEditingDoc(null);
      toast.success("Doc deleted");
    }
  };

  if (editingDoc) {
    return (
      <DocEditor
        doc={editingDoc}
        onBack={() => {
          setEditingDoc(null);
          fetchDocs();
        }}
        onDelete={() => handleDelete(editingDoc.id)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Docs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Notes linked to your CRM entities.</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-primary/20 text-primary px-3 py-2 text-xs font-medium transition hover:bg-primary/30 disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" /> New Doc
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <DocIcon className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No docs yet.</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Create a doc to link notes to deals, contacts, or groups.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setEditingDoc(doc)}
              className="w-full text-left rounded-2xl border border-white/10 bg-white/[0.035] p-4 hover:bg-white/[0.06] transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate">{doc.title}</h3>
                  {doc.content && (
                    <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-1">{doc.content}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/40 shrink-0 ml-4">
                  {timeAgo(doc.updated_at)}
                </span>
              </div>
              {doc.links.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {doc.links.map((link, i) => (
                    <span
                      key={i}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        link.entity_type === "deal" && "bg-emerald-500/20 text-emerald-400",
                        link.entity_type === "contact" && "bg-blue-500/20 text-blue-400",
                        link.entity_type === "group" && "bg-purple-500/20 text-purple-400",
                      )}
                    >
                      {link.entity_type}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Doc Editor ---

function DocEditor({ doc, onBack, onDelete }: { doc: Doc; onBack: () => void; onDelete: () => void }) {
  const [title, setTitle] = React.useState(doc.title);
  const [content, setContent] = React.useState(doc.content);
  const [links, setLinks] = React.useState<DocLink[]>(doc.links ?? []);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entity search for linking
  const [linkSearch, setLinkSearch] = React.useState("");
  const [linkResults, setLinkResults] = React.useState<EntityOption[]>([]);
  const [showLinkSearch, setShowLinkSearch] = React.useState(false);

  const save = React.useCallback(async (t: string, c: string, l: DocLink[]) => {
    setSaving(true);
    try {
      await fetch(`/api/docs/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          content: c,
          links: l.map((link) => ({ entity_type: link.entity_type, entity_id: link.entity_id })),
        }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [doc.id]);

  // Debounced auto-save
  const scheduleAutoSave = React.useCallback((t: string, c: string, l: DocLink[]) => {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(t, c, l), 2000);
  }, [save]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    scheduleAutoSave(val, content, links);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    scheduleAutoSave(title, val, links);
  };

  // Search entities for linking
  React.useEffect(() => {
    if (!linkSearch || linkSearch.length < 2) {
      setLinkResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const [dealsRes, contactsRes, groupsRes] = await Promise.all([
          fetch(`/api/deals?search=${encodeURIComponent(linkSearch)}`, { signal: controller.signal }),
          fetch(`/api/contacts?search=${encodeURIComponent(linkSearch)}`, { signal: controller.signal }),
          fetch(`/api/groups`, { signal: controller.signal }),
        ]);

        const results: EntityOption[] = [];

        if (dealsRes.ok) {
          const { deals } = await dealsRes.json();
          (deals ?? [])
            .filter((d: { deal_name: string }) => d.deal_name.toLowerCase().includes(linkSearch.toLowerCase()))
            .slice(0, 5)
            .forEach((d: { id: string; deal_name: string }) => {
              results.push({ id: d.id, name: d.deal_name, type: "deal" });
            });
        }
        if (contactsRes.ok) {
          const { contacts } = await contactsRes.json();
          (contacts ?? []).slice(0, 5).forEach((c: { id: string; name: string }) => {
            results.push({ id: c.id, name: c.name, type: "contact" });
          });
        }
        if (groupsRes.ok) {
          const { groups } = await groupsRes.json();
          (groups ?? [])
            .filter((g: { group_name: string }) => g.group_name.toLowerCase().includes(linkSearch.toLowerCase()))
            .slice(0, 5)
            .forEach((g: { id: string; group_name: string }) => {
              results.push({ id: g.id, name: g.group_name, type: "group" });
            });
        }

        setLinkResults(results);
      } catch {
        // Aborted or failed — ignore
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [linkSearch]);

  const addLink = (entity: EntityOption) => {
    const exists = links.some((l) => l.entity_type === entity.type && l.entity_id === entity.id);
    if (exists) return;
    const newLinks = [...links, { entity_type: entity.type, entity_id: entity.id, entity_name: entity.name }];
    setLinks(newLinks);
    setLinkSearch("");
    setShowLinkSearch(false);
    scheduleAutoSave(title, content, newLinks);
  };

  const removeLink = (idx: number) => {
    const newLinks = links.filter((_, i) => i !== idx);
    setLinks(newLinks);
    scheduleAutoSave(title, content, newLinks);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (dirty) save(title, content, links);
            onBack();
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to Docs
        </button>
        <div className="flex items-center gap-2">
          {saving && <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>}
          {dirty && !saving && <span className="text-[10px] text-yellow-400">Unsaved</span>}
          {!dirty && !saving && <span className="text-[10px] text-green-400">Saved</span>}
          <button
            onClick={onDelete}
            className="text-xs text-red-400 hover:text-red-300 transition"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        className="w-full bg-transparent text-2xl font-semibold text-foreground focus:outline-none placeholder:text-muted-foreground/30"
        placeholder="Untitled"
      />

      {/* Entity links */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {links.map((link, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                link.entity_type === "deal" && "bg-emerald-500/20 text-emerald-400",
                link.entity_type === "contact" && "bg-blue-500/20 text-blue-400",
                link.entity_type === "group" && "bg-purple-500/20 text-purple-400",
              )}
            >
              {link.entity_name ?? link.entity_id.slice(0, 8)}
              <button onClick={() => removeLink(i)} className="hover:text-white ml-1">&times;</button>
            </span>
          ))}
          <button
            onClick={() => setShowLinkSearch(!showLinkSearch)}
            className="rounded-full border border-dashed border-white/20 px-2.5 py-1 text-xs text-muted-foreground hover:border-white/40 hover:text-foreground transition"
          >
            + Link entity
          </button>
        </div>

        {showLinkSearch && (
          <div className="relative">
            <input
              type="text"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Search deals, contacts, groups..."
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
            />
            {linkResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-[#0f1729] shadow-lg overflow-hidden">
                {linkResults.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => addLink(r)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/[0.04] transition text-left"
                  >
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                        r.type === "deal" && "bg-emerald-500/20 text-emerald-400",
                        r.type === "contact" && "bg-blue-500/20 text-blue-400",
                        r.type === "group" && "bg-purple-500/20 text-purple-400",
                      )}
                    >
                      {r.type}
                    </span>
                    <span className="text-foreground">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content editor */}
      <textarea
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder="Write your notes here... (Markdown supported)"
        className="w-full min-h-[60vh] rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 resize-none font-mono leading-relaxed"
      />
    </div>
  );
}

// Inline icons

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
