"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Command } from "cmdk";
import type { ConfigFieldDef } from "../../core/types";

// ── Shared hook: fetch async options ─────────────────────────────

interface OptionItem {
  value: string;
  label: string;
}

function useAsyncOptions(field: ConfigFieldDef) {
  const [options, setOptions] = React.useState<OptionItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [fetchKey, setFetchKey] = React.useState(0);

  React.useEffect(() => {
    if (!field.optionsUrl) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(field.optionsUrl)
      .then((res) => {
        if (!res.ok) {
          if (!cancelled) { setOptions([]); setLoading(false); }
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        const items: Record<string, unknown>[] =
          data.data ?? data.groups ?? data.stages ??
          data.contacts ?? data.channels ?? data.users ??
          (Array.isArray(data) ? data : []);

        const mapped = items.map((item) => {
          if (field.mapOption) return field.mapOption(item);
          return {
            value: String((item as Record<string, unknown>).id ?? (item as Record<string, unknown>).value ?? ""),
            label: String((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).label ?? (item as Record<string, unknown>).id ?? ""),
          };
        });
        setOptions(mapped);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) { setError(String(err)); setOptions([]); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [field.optionsUrl, fetchKey]);

  const refetch = React.useCallback(() => setFetchKey((k) => k + 1), []);

  return { options, loading, error, refetch };
}

// ── Click-outside hook ───────────────────────────────────────────

function useClickOutside(refs: React.RefObject<HTMLElement | null>[], handler: () => void) {
  React.useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const inside = refs.some((ref) => ref.current?.contains(e.target as Node));
      if (!inside) handler();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [refs, handler]);
}

// ── Combobox for static select fields ────────────────────────────

export function ComboboxField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = field.options ?? [];
  const strVal = value == null ? "" : String(value);

  if (options.length < 5) {
    return (
      <select
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-white/20"
      >
        <option value="">{field.placeholder ?? "Select..."}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  return (
    <ComboboxDropdown
      options={options}
      value={strVal}
      onChange={(v) => onChange(v)}
      placeholder={field.placeholder ?? "Select..."}
      loading={false}
    />
  );
}

// ── Async combobox for async_select fields ───────────────────────

export function AsyncComboboxField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { options, loading, error, refetch } = useAsyncOptions(field);
  const strVal = value == null ? "" : String(value);
  const [manualMode, setManualMode] = React.useState(false);
  const [manualValue, setManualValue] = React.useState(strVal);
  const [addMode, setAddMode] = React.useState(false);
  const [newId, setNewId] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleCreate() {
    if (!field.createUrl || !newId.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      const keys = field.createFields ?? { valueKey: "channel_id", labelKey: "channel_name" };
      await fetch(field.createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [keys.valueKey]: newId.trim(), [keys.labelKey]: newName.trim() }),
      });
      onChange(newId.trim());
      setAddMode(false);
      setNewId("");
      setNewName("");
      refetch();
    } finally {
      setSaving(false);
    }
  }

  if (addMode && field.createUrl) {
    return (
      <div className="space-y-1.5">
        <input
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="ID (e.g. C06CTNC7LKU)"
          autoFocus
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="Display name"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newId.trim() || !newName.trim() || saving}
            className="flex-1 rounded-lg bg-primary/20 text-primary text-[10px] py-1 hover:bg-primary/30 disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving..." : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setAddMode(false)}
            className="rounded-lg bg-white/5 text-muted-foreground text-[10px] px-3 py-1 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (manualMode || (error && !loading)) {
    return (
      <div className="space-y-1">
        {error && (
          <p className="text-[9px] text-yellow-400/70">Could not load options — enter manually</p>
        )}
        <div className="flex gap-1">
          <input
            value={manualValue}
            onChange={(e) => {
              setManualValue(e.target.value);
              onChange(e.target.value);
            }}
            className="flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
            placeholder={field.placeholder ?? "Enter value..."}
          />
          {!error && (
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className="text-[9px] text-muted-foreground hover:text-foreground px-1.5"
            >
              List
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <ComboboxDropdown
      options={options}
      value={strVal}
      onChange={(v) => {
        onChange(v);
        const opt = options.find((o) => o.value === v);
        if (opt && field.onSelectExtra) field.onSelectExtra(opt);
      }}
      placeholder={field.placeholder ?? "Select..."}
      loading={loading}
      onManual={() => {
        setManualMode(true);
        setManualValue(strVal);
      }}
      onAdd={field.createUrl ? () => setAddMode(true) : undefined}
    />
  );
}

// ── Multi-select for static options ──────────────────────────────

export function MultiSelectField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = field.options ?? [];
  const selected: string[] = Array.isArray(value) ? value : [];

  return (
    <MultiComboboxDropdown
      options={options}
      value={selected}
      onChange={onChange}
      placeholder={field.placeholder ?? "Select..."}
      loading={false}
    />
  );
}

// ── Async multi-select ───────────────────────────────────────────

export function AsyncMultiSelectField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { options, loading } = useAsyncOptions(field);
  const selected: string[] = Array.isArray(value) ? value : [];

  return (
    <MultiComboboxDropdown
      options={options}
      value={selected}
      onChange={onChange}
      placeholder={field.placeholder ?? "Select..."}
      loading={loading}
    />
  );
}

// ── Portal dropdown (renders outside scroll containers) ──────────

function PortalDropdown({
  triggerRef,
  children,
}: {
  triggerRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 0 });

  React.useEffect(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [triggerRef]);

  // Re-position on scroll
  React.useEffect(() => {
    function update() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    // Listen to scroll on all ancestors
    let el = triggerRef.current?.parentElement;
    const scrollables: Element[] = [];
    while (el) {
      if (el.scrollHeight > el.clientHeight) scrollables.push(el);
      el = el.parentElement;
    }
    scrollables.forEach((s) => s.addEventListener("scroll", update, { passive: true }));
    window.addEventListener("resize", update, { passive: true });
    return () => {
      scrollables.forEach((s) => s.removeEventListener("scroll", update));
      window.removeEventListener("resize", update);
    };
  }, [triggerRef]);

  return createPortal(
    <div
      style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
    >
      {children}
    </div>,
    document.body
  );
}

// ── Core dropdown component (single select) ──────────────────────

function ComboboxDropdown({
  options,
  value,
  onChange,
  placeholder,
  loading,
  onManual,
  onAdd,
}: {
  options: OptionItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  loading: boolean;
  onManual?: () => void;
  onAdd?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useClickOutside([triggerRef as React.RefObject<HTMLElement | null>, dropdownRef as React.RefObject<HTMLElement | null>], () => setOpen(false));

  const selectedLabel = options.find((o) => o.value === value)?.label;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground/50 border border-white/10 rounded-lg h-8">
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        Loading...
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="w-full flex items-center justify-between rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none hover:border-white/20 transition-colors text-left"
      >
        <span className={selectedLabel ? "text-foreground truncate" : "text-muted-foreground/50 truncate"}>
          {selectedLabel ?? placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="text-muted-foreground/40 hover:text-foreground cursor-pointer"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </span>
          )}
          <svg className="h-3 w-3 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
          </svg>
        </span>
      </button>

      {open && (
        <PortalDropdown triggerRef={triggerRef as React.RefObject<HTMLElement>}>
          <div ref={dropdownRef} className="rounded-lg border border-white/10 bg-[hsl(var(--card))] shadow-2xl overflow-hidden">
            <Command shouldFilter={false}>
              <div className="px-2 py-1.5 border-b border-white/5">
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search..."
                  className="w-full bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/40"
                  autoFocus
                />
              </div>
              <Command.List className="max-h-48 overflow-y-auto p-1">
                <Command.Empty className="px-3 py-2 text-[10px] text-muted-foreground/50">
                  No results found
                </Command.Empty>
                {options
                  .filter((opt) => {
                    if (!search) return true;
                    const s = search.toLowerCase();
                    return opt.label.toLowerCase().includes(s) || opt.value.toLowerCase().includes(s);
                  })
                  .map((opt) => (
                    <Command.Item
                      key={opt.value}
                      value={opt.value}
                      onSelect={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-white/5 data-[selected=true]:bg-white/5 text-foreground"
                    >
                      <span className="h-3 w-3 shrink-0 flex items-center justify-center">
                        {opt.value === value && (
                          <svg className="h-3 w-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </Command.Item>
                  ))}
              </Command.List>
              {(onAdd || onManual) && (
                <div className="border-t border-white/5 p-1 space-y-0.5">
                  {onAdd && (
                    <button
                      type="button"
                      onClick={() => { setOpen(false); onAdd(); }}
                      className="w-full text-left px-2 py-1.5 rounded-md text-[10px] text-primary/70 hover:bg-primary/5 hover:text-primary flex items-center gap-1.5"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                      Add new...
                    </button>
                  )}
                  {onManual && (
                    <button
                      type="button"
                      onClick={() => { setOpen(false); onManual(); }}
                      className="w-full text-left px-2 py-1.5 rounded-md text-[10px] text-muted-foreground/50 hover:bg-white/5 hover:text-muted-foreground"
                    >
                      Enter ID manually...
                    </button>
                  )}
                </div>
              )}
            </Command>
          </div>
        </PortalDropdown>
      )}
    </div>
  );
}

// ── Core multi-select dropdown ───────────────────────────────────

function MultiComboboxDropdown({
  options,
  value,
  onChange,
  placeholder,
  loading,
}: {
  options: OptionItem[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  loading: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useClickOutside([triggerRef as React.RefObject<HTMLElement | null>, dropdownRef as React.RefObject<HTMLElement | null>], () => setOpen(false));

  function toggle(val: string) {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground/50 border border-white/10 rounded-lg h-8">
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        Loading...
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="w-full flex items-center justify-between rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs min-h-[32px] outline-none hover:border-white/20 transition-colors text-left"
      >
        <span className={value.length > 0 ? "text-foreground" : "text-muted-foreground/50"}>
          {value.length > 0 ? `${value.length} selected` : placeholder}
        </span>
        <svg className="h-3 w-3 text-muted-foreground/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
        </svg>
      </button>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {value.map((v) => {
            const label = options.find((o) => o.value === v)?.label ?? v;
            return (
              <span key={v} className="inline-flex items-center gap-1 rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] text-foreground">
                {label}
                <button type="button" onClick={() => toggle(v)} className="text-muted-foreground/40 hover:text-foreground">
                  <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <PortalDropdown triggerRef={triggerRef as React.RefObject<HTMLElement>}>
          <div ref={dropdownRef} className="rounded-lg border border-white/10 bg-[hsl(var(--card))] shadow-2xl overflow-hidden">
            <Command shouldFilter={false}>
              <div className="px-2 py-1.5 border-b border-white/5">
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search..."
                  className="w-full bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/40"
                  autoFocus
                />
              </div>
              <Command.List className="max-h-48 overflow-y-auto p-1">
                <Command.Empty className="px-3 py-2 text-[10px] text-muted-foreground/50">
                  No results found
                </Command.Empty>
                {options
                  .filter((opt) => {
                    if (!search) return true;
                    const s = search.toLowerCase();
                    return opt.label.toLowerCase().includes(s) || opt.value.toLowerCase().includes(s);
                  })
                  .map((opt) => (
                    <Command.Item
                      key={opt.value}
                      value={opt.value}
                      onSelect={() => toggle(opt.value)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-white/5 data-[selected=true]:bg-white/5 text-foreground"
                    >
                      <span className="h-3 w-3 shrink-0 flex items-center justify-center rounded-sm border border-white/20">
                        {value.includes(opt.value) && (
                          <svg className="h-2.5 w-2.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </Command.Item>
                  ))}
              </Command.List>
            </Command>
          </div>
        </PortalDropdown>
      )}
    </div>
  );
}
