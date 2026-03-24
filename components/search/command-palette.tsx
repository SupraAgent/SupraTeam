"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, X, ArrowRight, Mail, Users, MessageCircle, Kanban, Settings, Zap, FileText, Shield, Radio, Network, Home, PenSquare } from "lucide-react";

type SearchResult = {
  deals: { id: string; deal_name: string; board_type: string; stage: { name: string; color: string } | null }[];
  contacts: { id: string; name: string; company: string | null; telegram_username: string | null }[];
  groups: { id: string; group_name: string }[];
};

type ActionItem = {
  id: string;
  type: "action" | "navigate";
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
};

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult>({ deals: [], contacts: [], groups: [] });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }

  // ── Quick actions ─────────────────────────────────────────

  const quickActions: ActionItem[] = React.useMemo(() => [
    {
      id: "compose-email",
      type: "action",
      label: "Compose Email",
      description: "Write a new email",
      icon: <PenSquare className="h-4 w-4" />,
      shortcut: "c",
      action: () => {
        router.push("/email");
        // Dispatch compose event after navigation
        setTimeout(() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
        }, 300);
      },
    },
    {
      id: "new-deal",
      type: "action",
      label: "Create New Deal",
      description: "Add a deal to the pipeline",
      icon: <Zap className="h-4 w-4" />,
      action: () => { router.push("/pipeline?action=new"); },
    },
    {
      id: "new-contact",
      type: "action",
      label: "Add Contact",
      description: "Create a new contact",
      icon: <Users className="h-4 w-4" />,
      action: () => { router.push("/contacts?action=new"); },
    },
  ], [router]);

  const navItems: ActionItem[] = React.useMemo(() => [
    { id: "nav-home", type: "navigate", label: "Dashboard", icon: <Home className="h-4 w-4" />, shortcut: "g h", action: () => router.push("/") },
    { id: "nav-pipeline", type: "navigate", label: "Pipeline", icon: <Kanban className="h-4 w-4" />, shortcut: "g p", action: () => router.push("/pipeline") },
    { id: "nav-email", type: "navigate", label: "Email", icon: <Mail className="h-4 w-4" />, shortcut: "g e", action: () => router.push("/email") },
    { id: "nav-contacts", type: "navigate", label: "Contacts", icon: <Users className="h-4 w-4" />, shortcut: "g c", action: () => router.push("/contacts") },
    { id: "nav-groups", type: "navigate", label: "TG Groups", icon: <MessageCircle className="h-4 w-4" />, shortcut: "g g", action: () => router.push("/groups") },
    { id: "nav-broadcasts", type: "navigate", label: "Broadcasts", icon: <Radio className="h-4 w-4" />, action: () => router.push("/broadcasts") },
    { id: "nav-access", type: "navigate", label: "Access Control", icon: <Shield className="h-4 w-4" />, action: () => router.push("/access") },
    { id: "nav-graph", type: "navigate", label: "Graph", icon: <Network className="h-4 w-4" />, action: () => router.push("/graph") },
    { id: "nav-docs", type: "navigate", label: "Docs", icon: <FileText className="h-4 w-4" />, action: () => router.push("/docs") },
    { id: "nav-settings", type: "navigate", label: "Settings", icon: <Settings className="h-4 w-4" />, shortcut: "g s", action: () => router.push("/settings") },
    { id: "nav-settings-email", type: "navigate", label: "Email Settings", icon: <Settings className="h-4 w-4" />, action: () => router.push("/settings/integrations/email") },
    { id: "nav-settings-pipeline", type: "navigate", label: "Pipeline Settings", icon: <Settings className="h-4 w-4" />, action: () => router.push("/settings/pipeline") },
    { id: "nav-settings-team", type: "navigate", label: "Team Settings", icon: <Settings className="h-4 w-4" />, action: () => router.push("/settings/team") },
  ], [router]);

  // Global keyboard shortcut
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        closeAndReset();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Focus input when opened
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search on query change with AbortController
  React.useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ deals: [], contacts: [], groups: [] });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then(setResults)
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  // Filter actions by query
  const filteredActions = React.useMemo(() => {
    if (!query) return quickActions;
    const q = query.toLowerCase();
    return quickActions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)
    );
  }, [query, quickActions]);

  const filteredNav = React.useMemo(() => {
    if (!query) return navItems;
    const q = query.toLowerCase();
    return navItems.filter((n) => n.label.toLowerCase().includes(q));
  }, [query, navItems]);

  // Flatten all items for keyboard navigation
  const allItems: { type: string; label: string; action: () => void }[] = React.useMemo(() => {
    const items: { type: string; label: string; action: () => void }[] = [];

    // Actions
    for (const a of filteredActions) {
      items.push({ type: "action", label: a.label, action: () => { a.action(); closeAndReset(); } });
    }

    // Search results
    for (const d of results.deals) {
      items.push({ type: "deal", label: d.deal_name, action: () => { router.push(`/pipeline?highlight=${d.id}`); closeAndReset(); } });
    }
    for (const c of results.contacts) {
      items.push({ type: "contact", label: c.name, action: () => { router.push("/contacts"); closeAndReset(); } });
    }
    for (const g of results.groups) {
      items.push({ type: "group", label: g.group_name, action: () => { router.push("/groups"); closeAndReset(); } });
    }

    // Navigation
    for (const n of filteredNav) {
      items.push({ type: "navigate", label: n.label, action: () => { n.action(); closeAndReset(); } });
    }

    return items;
  }, [filteredActions, filteredNav, results, router]);

  // Scroll selected item into view
  React.useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && allItems[selectedIndex]) {
      e.preventDefault();
      allItems[selectedIndex].action();
    }
  }

  if (!open) return null;

  // Build sections with cumulative indices
  let idx = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/60" onClick={closeAndReset} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[hsl(225,35%,7%)] shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search or type a command..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto p-2">
          {/* Quick Actions */}
          {filteredActions.length > 0 && (
            <Section label="Actions">
              {filteredActions.map((a) => {
                const thisIdx = idx++;
                return (
                  <CommandRow
                    key={a.id}
                    dataIndex={thisIdx}
                    selected={selectedIndex === thisIdx}
                    icon={a.icon}
                    label={a.label}
                    description={a.description}
                    shortcut={a.shortcut}
                    onClick={() => { a.action(); closeAndReset(); }}
                    onMouseEnter={() => setSelectedIndex(thisIdx)}
                  />
                );
              })}
            </Section>
          )}

          {/* Search results */}
          {results.deals.length > 0 && (
            <Section label="Deals">
              {results.deals.map((d) => {
                const thisIdx = idx++;
                return (
                  <CommandRow
                    key={d.id}
                    dataIndex={thisIdx}
                    selected={selectedIndex === thisIdx}
                    icon={<Kanban className="h-4 w-4" />}
                    label={d.deal_name}
                    description={`${d.board_type}${d.stage ? ` / ${d.stage.name}` : ""}`}
                    onClick={() => { router.push(`/pipeline?highlight=${d.id}`); closeAndReset(); }}
                    onMouseEnter={() => setSelectedIndex(thisIdx)}
                  />
                );
              })}
            </Section>
          )}

          {results.contacts.length > 0 && (
            <Section label="Contacts">
              {results.contacts.map((c) => {
                const thisIdx = idx++;
                return (
                  <CommandRow
                    key={c.id}
                    dataIndex={thisIdx}
                    selected={selectedIndex === thisIdx}
                    icon={<Users className="h-4 w-4" />}
                    label={c.name}
                    description={c.company ?? c.telegram_username ? `@${c.telegram_username}` : ""}
                    onClick={() => { router.push("/contacts"); closeAndReset(); }}
                    onMouseEnter={() => setSelectedIndex(thisIdx)}
                  />
                );
              })}
            </Section>
          )}

          {results.groups.length > 0 && (
            <Section label="TG Groups">
              {results.groups.map((g) => {
                const thisIdx = idx++;
                return (
                  <CommandRow
                    key={g.id}
                    dataIndex={thisIdx}
                    selected={selectedIndex === thisIdx}
                    icon={<MessageCircle className="h-4 w-4" />}
                    label={g.group_name}
                    onClick={() => { router.push("/groups"); closeAndReset(); }}
                    onMouseEnter={() => setSelectedIndex(thisIdx)}
                  />
                );
              })}
            </Section>
          )}

          {/* Navigation */}
          {filteredNav.length > 0 && (
            <Section label="Go to">
              {filteredNav.map((n) => {
                const thisIdx = idx++;
                const isActive = n.id === "nav-home" ? pathname === "/" : pathname.startsWith(n.label.toLowerCase().replace(/ /g, "-"));
                return (
                  <CommandRow
                    key={n.id}
                    dataIndex={thisIdx}
                    selected={selectedIndex === thisIdx}
                    icon={n.icon}
                    label={n.label}
                    shortcut={n.shortcut}
                    onClick={() => { n.action(); closeAndReset(); }}
                    onMouseEnter={() => setSelectedIndex(thisIdx)}
                  />
                );
              })}
            </Section>
          )}

          {/* Empty state */}
          {allItems.length === 0 && query.length >= 2 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section header ──────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {label}
      </p>
      {children}
    </div>
  );
}

// ── Command row ─────────────────────────────────────────────

function CommandRow({
  dataIndex,
  selected,
  icon,
  label,
  description,
  shortcut,
  onClick,
  onMouseEnter,
}: {
  dataIndex: number;
  selected: boolean;
  icon: React.ReactNode;
  label: string;
  description?: string;
  shortcut?: string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      data-index={dataIndex}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex items-center gap-3 w-full rounded-lg px-3 py-2 text-left transition-colors",
        selected ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
      )}
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{label}</p>
        {description && (
          <p className="text-[10px] text-muted-foreground truncate">{description}</p>
        )}
      </div>
      {shortcut && (
        <kbd className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {shortcut}
        </kbd>
      )}
      <ArrowRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
    </button>
  );
}
