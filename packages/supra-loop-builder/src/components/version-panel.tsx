"use client";

import * as React from "react";
import type { Node, Edge } from "@xyflow/react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { VersionIndexEntry } from "../lib/workflow-versions";

// ── Helpers ──────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Types ────────────────────────────────────────────────────────

export type VersionPanelProps = {
  versions: VersionIndexEntry[];
  hasUnsavedChanges: boolean;
  currentNodeCount: number;
  currentEdgeCount: number;
  onCreateVersion: (name?: string) => Promise<void>;
  onLoadVersion: (id: string) => Promise<void>;
  onDeleteVersion: (id: string) => Promise<void>;
  onAutoSave: (name: string) => Promise<void>;
  onClose: () => void;
};

// ── Component ────────────────────────────────────────────────────

export function VersionPanel({
  versions,
  hasUnsavedChanges,
  currentNodeCount,
  currentEdgeCount,
  onCreateVersion,
  onLoadVersion,
  onDeleteVersion,
  onAutoSave,
  onClose,
}: VersionPanelProps) {
  const [isCreating, setIsCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [confirmLoadId, setConfirmLoadId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onCreateVersion(newName.trim() || undefined);
      setNewName("");
      setIsCreating(false);
    } finally {
      setSaving(false);
    }
  }

  const [loadError, setLoadError] = React.useState<string | null>(null);

  async function handleLoad(id: string, name: string) {
    // First click: show confirmation (with diff preview)
    if (confirmLoadId !== id) {
      setConfirmLoadId(id);
      setConfirmDeleteId(null);
      setLoadError(null);
      return;
    }
    // Second click: auto-save current state, then load
    try {
      if (hasUnsavedChanges) {
        await onAutoSave(`[auto] before loading ${name}`);
      }
      await onLoadVersion(id);
      setConfirmLoadId(null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load version");
    }
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setConfirmLoadId(null);
      return;
    }
    try {
      await onDeleteVersion(id);
    } catch {
      // Silently handle — the version list will refresh from parent
    }
    setConfirmDeleteId(null);
  }

  return (
    <div className="border-b border-white/10 px-6 py-3 max-h-[30vh] overflow-y-auto">
      {/* Error banner */}
      {loadError && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 mb-2">
          {loadError}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">
          Versions ({versions.length})
        </span>
        <div className="flex items-center gap-2">
          {isCreating ? (
            <div className="flex items-center gap-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Version name..."
                className="h-7 w-36 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setIsCreating(false);
                }}
                autoFocus
              />
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
                {saving ? "..." : "Save"}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsCreating(true)}>
              Save Version
            </Button>
          )}
          <button className="text-muted-foreground hover:text-foreground text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* Empty state */}
      {versions.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-xs">
          <p>No saved versions yet.</p>
          <p className="mt-1">Save a version to create restore points.</p>
          {!isCreating && (
            <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setIsCreating(true)}>
              Save First Version
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1" role="list">
          {versions.map((ver) => {
            const isAutoSave = ver.name.startsWith("[auto]");
            const isConfirmingLoad = confirmLoadId === ver.id;
            const isConfirmingDelete = confirmDeleteId === ver.id;

            return (
              <div
                key={ver.id}
                role="listitem"
                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${isAutoSave ? "text-muted-foreground italic" : "text-foreground"}`}>
                    {ver.name}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    {ver.nodeCount} nodes, {ver.edgeCount} edges
                  </span>
                  <span className="text-muted-foreground ml-2">
                    {relativeTime(ver.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-1 ml-2 shrink-0">
                  {isConfirmingLoad ? (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground text-[10px]">
                        {currentNodeCount} nodes → {ver.nodeCount} nodes
                        {hasUnsavedChanges && " (will auto-save current)"}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-400" onClick={() => handleLoad(ver.id, ver.name)}>
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setConfirmLoadId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleLoad(ver.id, ver.name)}>
                      Load
                    </Button>
                  )}

                  {isConfirmingDelete ? (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-red-400" onClick={() => handleDelete(ver.id)}>
                      Confirm Delete
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => handleDelete(ver.id)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
