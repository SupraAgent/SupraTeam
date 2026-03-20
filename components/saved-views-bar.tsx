"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SavedView = {
  id: string;
  name: string;
  page: string;
  filters: Record<string, unknown>;
  board_type: string | null;
  is_default: boolean;
  position: number;
};

type SavedViewsBarProps = {
  page: "pipeline" | "contacts";
  currentFilters: Record<string, unknown>;
  currentBoard?: string;
  onApplyView: (filters: Record<string, unknown>, board?: string) => void;
};

export function SavedViewsBar({ page, currentFilters, currentBoard, onApplyView }: SavedViewsBarProps) {
  const [views, setViews] = React.useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [showSave, setShowSave] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");

  const fetchViews = React.useCallback(async () => {
    const res = await fetch(`/api/views?page=${page}`);
    if (res.ok) {
      const { views: v } = await res.json();
      setViews(v ?? []);
      // Apply default view on first load
      const defaultView = (v ?? []).find((view: SavedView) => view.is_default);
      if (defaultView && !activeViewId) {
        setActiveViewId(defaultView.id);
        onApplyView(defaultView.filters, defaultView.board_type ?? undefined);
      }
    }
  }, [page, activeViewId, onApplyView]);

  React.useEffect(() => {
    fetchViews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleSave() {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        page,
        filters: currentFilters,
        board_type: currentBoard ?? null,
      }),
    });
    if (res.ok) {
      const { view } = await res.json();
      setViews((prev) => [...prev, view]);
      setActiveViewId(view.id);
      setNewName("");
      setShowSave(false);
      toast.success(`View "${view.name}" saved`);
    } else {
      toast.error("Failed to save view");
    }
    setSaving(false);
  }

  async function handleUpdate(id: string) {
    const res = await fetch("/api/views", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        filters: currentFilters,
        board_type: currentBoard ?? null,
      }),
    });
    if (res.ok) {
      setViews((prev) => prev.map((v) => v.id === id ? { ...v, filters: currentFilters as Record<string, unknown>, board_type: currentBoard ?? null } : v));
      toast.success("View updated");
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    const res = await fetch("/api/views", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName.trim() }),
    });
    if (res.ok) {
      setViews((prev) => prev.map((v) => v.id === id ? { ...v, name: editName.trim() } : v));
      setEditingId(null);
      setEditName("");
    }
  }

  async function handleSetDefault(id: string) {
    const res = await fetch("/api/views", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_default: true }),
    });
    if (res.ok) {
      setViews((prev) => prev.map((v) => ({ ...v, is_default: v.id === id })));
      toast.success("Default view set");
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/views?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setViews((prev) => prev.filter((v) => v.id !== id));
      if (activeViewId === id) setActiveViewId(null);
      toast.success("View deleted");
    }
  }

  function handleSelect(view: SavedView) {
    setActiveViewId(view.id);
    onApplyView(view.filters, view.board_type ?? undefined);
  }

  const hasFilters = Object.values(currentFilters).some((v) => v != null);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* "All" tab */}
      <button
        onClick={() => {
          setActiveViewId(null);
          onApplyView({});
        }}
        className={cn(
          "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
          !activeViewId
            ? "bg-primary/20 text-primary"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        )}
      >
        All
      </button>

      {/* Saved view tabs */}
      {views.map((view) => (
        <div key={view.id} className="group relative flex items-center">
          {editingId === view.id ? (
            <form
              onSubmit={(e) => { e.preventDefault(); handleRename(view.id); }}
              className="flex items-center gap-1"
            >
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-6 w-24 text-xs"
                autoFocus
                onBlur={() => setEditingId(null)}
              />
            </form>
          ) : (
            <button
              onClick={() => handleSelect(view)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                activeViewId === view.id
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              {view.is_default && <span className="mr-1 text-[10px]">*</span>}
              {view.name}
            </button>
          )}

          {/* Context menu on hover */}
          <div className="hidden group-hover:flex items-center absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full z-10 bg-[hsl(225,35%,8%)] border border-white/10 rounded-lg shadow-lg p-1 gap-0.5">
            <button
              onClick={() => handleUpdate(view.id)}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/10"
              title="Update with current filters"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
            </button>
            <button
              onClick={() => { setEditingId(view.id); setEditName(view.name); }}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/10"
              title="Rename"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            {!view.is_default && (
              <button
                onClick={() => handleSetDefault(view.id)}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/10"
                title="Set as default"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
            )}
            <button
              onClick={() => handleDelete(view.id)}
              className="rounded p-1 text-muted-foreground hover:text-red-400 hover:bg-white/10"
              title="Delete view"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>
      ))}

      {/* Save new view */}
      {showSave ? (
        <form
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          className="flex items-center gap-1"
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="View name..."
            className="h-6 w-28 text-xs"
            autoFocus
          />
          <Button
            type="submit"
            size="sm"
            disabled={saving || !newName.trim()}
            className="h-6 px-2 text-xs"
          >
            Save
          </Button>
          <button
            type="button"
            onClick={() => { setShowSave(false); setNewName(""); }}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </form>
      ) : (
        hasFilters && (
          <button
            onClick={() => setShowSave(true)}
            className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors border border-dashed border-white/10"
          >
            + Save view
          </button>
        )
      )}
    </div>
  );
}
