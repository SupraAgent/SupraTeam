"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { EmailTemplate } from "@/lib/email/types";

type TemplatePickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (template: EmailTemplate) => void;
};

export function TemplatePicker({ open, onClose, onSelect }: TemplatePickerProps) {
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/email/templates")
      .then((r) => r.json())
      .then((json) => setTemplates(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  React.useEffect(() => {
    if (!open) { setQuery(""); setSelectedIndex(0); }
  }, [open]);

  const filtered = React.useMemo(() => {
    if (!query) return templates;
    const q = query.toLowerCase();
    return templates.filter((t) => t.name.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q));
  }, [templates, query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      onSelect(filtered[selectedIndex]);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "hsl(var(--surface-4))" }}
      >
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <TemplateIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search templates..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ⌘;
          </kbd>
        </div>

        {/* Template list */}
        <div className="max-h-[300px] overflow-y-auto p-2">
          {loading ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {templates.length === 0 ? "No templates yet" : `No match for "${query}"`}
              </p>
              {templates.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  Create templates in Settings &gt; Email
                </p>
              )}
            </div>
          ) : (
            filtered.map((t, i) => (
              <button
                key={t.id}
                onClick={() => { onSelect(t); onClose(); }}
                onMouseEnter={() => setSelectedIndex(i)}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2.5 transition-colors",
                  selectedIndex === i ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
                )}
              >
                <p className="text-sm text-foreground">{t.name}</p>
                {t.subject && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    Subject: {t.subject}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                  {t.body.replace(/<[^>]+>/g, "").slice(0, 80)}
                </p>
                {t.variables.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {t.variables.map((v) => (
                      <span key={v} className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                        {`{${v}}`}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
