"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Twitter, Upload, Loader2 } from "lucide-react";

interface BulkXImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function BulkXImportModal({ open, onClose, onImported }: BulkXImportModalProps) {
  const [raw, setRaw] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<{
    created: number;
    skipped: number;
    skipped_handles: string[];
  } | null>(null);

  const parsed = React.useMemo(() => {
    if (!raw.trim()) return [];
    const handles = raw
      .split(/[,\n]+/)
      .map((h) => h.trim().replace(/^@/, ""))
      .filter((h) => h.length > 0);
    return [...new Set(handles.map((h) => h.toLowerCase()))].map(
      (lower) => handles.find((h) => h.toLowerCase() === lower) ?? lower
    );
  }, [raw]);

  async function handleImport() {
    if (parsed.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/contacts/bulk-import-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handles: parsed }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Import failed");
        return;
      }
      const data = await res.json();
      setResult({
        created: data.created,
        skipped: data.skipped,
        skipped_handles: data.skipped_handles,
      });
      if (data.created > 0) {
        toast.success(`Created ${data.created} contact(s)`);
        onImported();
      }
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    setRaw("");
    setResult(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[hsl(var(--card))] p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <Twitter className="h-5 w-5 text-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Bulk X Handle Import</h2>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Paste X/Twitter handles below, one per line or comma-separated. The @ prefix is optional.
        </p>

        <Textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setResult(null);
          }}
          placeholder={"@alice\nbob\ncharlie, dave"}
          className="min-h-[120px] font-mono text-xs"
        />

        {parsed.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Found <span className="text-foreground font-medium">{parsed.length}</span> unique handle{parsed.length !== 1 ? "s" : ""}
          </p>
        )}

        {result && (
          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1">
            <p className="text-xs text-foreground">
              Created <span className="text-green-400 font-medium">{result.created}</span>,
              Skipped <span className="text-amber-400 font-medium">{result.skipped}</span> (already exist)
            </p>
            {result.skipped_handles.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Skipped: {result.skipped_handles.join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing || parsed.length === 0}
            >
              {importing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1 h-3.5 w-3.5" />
              )}
              {importing ? "Importing..." : `Import ${parsed.length} Contact${parsed.length !== 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
