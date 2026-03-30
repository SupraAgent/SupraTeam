"use client";

import React from "react";
import { Braces, Hash, User, Zap, MessageCircle, Repeat } from "lucide-react";

// ── Variable Definitions ───────────────────────────────────

interface TemplateVariable {
  name: string;
  label: string;
  description: string;
}

interface VariableCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  variables: TemplateVariable[];
}

const VARIABLE_CATEGORIES: VariableCategory[] = [
  {
    id: "deal",
    label: "Deal",
    icon: <Hash className="w-3 h-3" />,
    variables: [
      { name: "deal_name", label: "Deal Name", description: "Name of the deal" },
      { name: "deal_value", label: "Deal Value", description: "Monetary value" },
      { name: "stage", label: "Stage", description: "Current pipeline stage" },
      { name: "board_type", label: "Board Type", description: "BD, Marketing, or Admin" },
      { name: "assigned_to", label: "Assigned To", description: "Assigned team member" },
      { name: "company", label: "Company", description: "Company name from contact" },
      { name: "tags", label: "Tags", description: "Deal tags" },
      { name: "quality_score", label: "Quality Score", description: "Deal quality score" },
    ],
  },
  {
    id: "contact",
    label: "Contact",
    icon: <User className="w-3 h-3" />,
    variables: [
      { name: "contact_name", label: "Contact Name", description: "Contact full name" },
      { name: "contact_email", label: "Contact Email", description: "Contact email address" },
      { name: "contact_telegram", label: "Contact Telegram", description: "Telegram username" },
      { name: "contact_phone", label: "Contact Phone", description: "Contact phone number" },
    ],
  },
  {
    id: "trigger",
    label: "Trigger",
    icon: <Zap className="w-3 h-3" />,
    variables: [
      { name: "trigger_type", label: "Trigger Type", description: "What triggered the workflow" },
      { name: "triggered_at", label: "Triggered At", description: "Timestamp of trigger" },
      { name: "triggered_by", label: "Triggered By", description: "User who triggered" },
    ],
  },
  {
    id: "tg",
    label: "TG Context",
    icon: <MessageCircle className="w-3 h-3" />,
    variables: [
      { name: "tg_chat_title", label: "Chat Title", description: "Telegram group title" },
      { name: "tg_recent_messages", label: "Recent Messages", description: "Recent chat messages" },
      { name: "message_text", label: "Message Text", description: "Triggering message text" },
      { name: "last_sender", label: "Last Sender", description: "Last message sender name" },
    ],
  },
  {
    id: "loop",
    label: "Loop",
    icon: <Repeat className="w-3 h-3" />,
    variables: [
      { name: "loop_item", label: "Loop Item", description: "Current item in loop" },
      { name: "loop_index", label: "Loop Index", description: "Current iteration index" },
    ],
  },
];

// Flatten for search
const ALL_VARIABLES = VARIABLE_CATEGORIES.flatMap((cat) =>
  cat.variables.map((v) => ({ ...v, category: cat.id, categoryLabel: cat.label }))
);

// ── Fuzzy Match ────────────────────────────────────────────

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  // Simple subsequence match
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── VariableTextarea Component ─────────────────────────────

interface VariableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  mono?: boolean;
}

export function VariableTextarea({
  value,
  onChange,
  placeholder,
  className = "",
  minHeight = "60px",
  mono = false,
}: VariableTextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [filterText, setFilterText] = React.useState("");
  const [triggerPos, setTriggerPos] = React.useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Filter variables based on typed text after {{
  const filtered = React.useMemo(() => {
    if (!filterText) return ALL_VARIABLES;
    return ALL_VARIABLES.filter(
      (v) =>
        fuzzyMatch(filterText, v.name) ||
        fuzzyMatch(filterText, v.label) ||
        fuzzyMatch(filterText, v.categoryLabel)
    );
  }, [filterText]);

  // Reset selected index when filter changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  // Close dropdown on click outside
  React.useEffect(() => {
    if (!showDropdown) return;
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  // Detect {{ trigger
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart ?? 0;
    // Look backward from cursor for {{
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastDoubleBrace = textBeforeCursor.lastIndexOf("{{");

    if (lastDoubleBrace !== -1) {
      const textAfterBrace = textBeforeCursor.slice(lastDoubleBrace + 2);
      // Only show if no closing }} between {{ and cursor and no newline
      if (!textAfterBrace.includes("}}") && !textAfterBrace.includes("\n")) {
        setShowDropdown(true);
        setFilterText(textAfterBrace);
        setTriggerPos(lastDoubleBrace);
        return;
      }
    }
    setShowDropdown(false);
    setFilterText("");
    setTriggerPos(null);
  }

  // Insert variable at cursor
  function insertVariable(varName: string) {
    if (triggerPos === null || !textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart ?? 0;
    const before = value.slice(0, triggerPos);
    const after = value.slice(cursorPos);
    const inserted = `{{${varName}}}`;
    const newValue = before + inserted + after;
    onChange(newValue);
    setShowDropdown(false);
    setFilterText("");
    setTriggerPos(null);

    // Restore focus and set cursor after inserted variable
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = before.length + inserted.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showDropdown || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertVariable(filtered[selectedIndex].name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowDropdown(false);
    }
  }

  // Group filtered results by category for display
  const groupedFiltered = React.useMemo(() => {
    const groups: { category: string; categoryLabel: string; icon: React.ReactNode; items: typeof filtered }[] = [];
    let runningIndex = 0;

    for (const cat of VARIABLE_CATEGORIES) {
      const catItems = filtered.filter((v) => v.category === cat.id);
      if (catItems.length > 0) {
        groups.push({
          category: cat.id,
          categoryLabel: cat.label,
          icon: cat.icon,
          items: catItems.map((item) => ({ ...item, _index: runningIndex++ })) as (typeof filtered[0] & { _index: number })[],
        });
      }
    }
    return groups;
  }, [filtered]);

  const inputClass =
    "w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        className={`${inputClass} resize-y ${mono ? "font-mono" : ""} ${className}`}
        style={{ minHeight }}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      <div className="flex items-center gap-1 mt-1">
        <Braces className="w-3 h-3 text-muted-foreground/50" />
        <span className="text-[10px] text-muted-foreground/50">
          Type {"{{" } for variables
        </span>
      </div>

      {showDropdown && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-white/10 bg-zinc-900 shadow-xl max-h-56 overflow-y-auto"
          style={{ top: "100%" }}
        >
          {groupedFiltered.map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide border-b border-white/5 bg-white/[0.02] sticky top-0">
                {group.icon}
                {group.categoryLabel}
              </div>
              {group.items.map((v) => {
                const item = v as typeof v & { _index: number };
                const isSelected = item._index === selectedIndex;
                return (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => insertVariable(v.name)}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-white/5"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <code className="text-[11px] font-mono bg-white/5 px-1 rounded">
                        {v.name}
                      </code>
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {v.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {showDropdown && filtered.length === 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-white/10 bg-zinc-900 shadow-xl"
          style={{ top: "100%" }}
        >
          <div className="px-2.5 py-2 text-[10px] text-muted-foreground">
            No matching variables
          </div>
        </div>
      )}
    </div>
  );
}

// ── VariableInput (single-line) ────────────────────────────

interface VariableInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function VariableInput({
  value,
  onChange,
  placeholder,
  className = "",
}: VariableInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [filterText, setFilterText] = React.useState("");
  const [triggerPos, setTriggerPos] = React.useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const filtered = React.useMemo(() => {
    if (!filterText) return ALL_VARIABLES;
    return ALL_VARIABLES.filter(
      (v) =>
        fuzzyMatch(filterText, v.name) ||
        fuzzyMatch(filterText, v.label) ||
        fuzzyMatch(filterText, v.categoryLabel)
    );
  }, [filterText]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  React.useEffect(() => {
    if (!showDropdown) return;
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart ?? 0;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastDoubleBrace = textBeforeCursor.lastIndexOf("{{");

    if (lastDoubleBrace !== -1) {
      const textAfterBrace = textBeforeCursor.slice(lastDoubleBrace + 2);
      if (!textAfterBrace.includes("}}")) {
        setShowDropdown(true);
        setFilterText(textAfterBrace);
        setTriggerPos(lastDoubleBrace);
        return;
      }
    }
    setShowDropdown(false);
    setFilterText("");
    setTriggerPos(null);
  }

  function insertVariable(varName: string) {
    if (triggerPos === null || !inputRef.current) return;
    const cursorPos = inputRef.current.selectionStart ?? 0;
    const before = value.slice(0, triggerPos);
    const after = value.slice(cursorPos);
    const inserted = `{{${varName}}}`;
    const newValue = before + inserted + after;
    onChange(newValue);
    setShowDropdown(false);
    setFilterText("");
    setTriggerPos(null);

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPos = before.length + inserted.length;
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertVariable(filtered[selectedIndex].name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowDropdown(false);
    }
  }

  const groupedFiltered = React.useMemo(() => {
    const groups: { category: string; categoryLabel: string; icon: React.ReactNode; items: typeof filtered }[] = [];
    let runningIndex = 0;

    for (const cat of VARIABLE_CATEGORIES) {
      const catItems = filtered.filter((v) => v.category === cat.id);
      if (catItems.length > 0) {
        groups.push({
          category: cat.id,
          categoryLabel: cat.label,
          icon: cat.icon,
          items: catItems.map((item) => ({ ...item, _index: runningIndex++ })) as (typeof filtered[0] & { _index: number })[],
        });
      }
    }
    return groups;
  }, [filtered]);

  const baseInputClass =
    "w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className={`${baseInputClass} ${className}`}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />

      {showDropdown && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-white/10 bg-zinc-900 shadow-xl max-h-56 overflow-y-auto"
        >
          {groupedFiltered.map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide border-b border-white/5 bg-white/[0.02] sticky top-0">
                {group.icon}
                {group.categoryLabel}
              </div>
              {group.items.map((v) => {
                const item = v as typeof v & { _index: number };
                const isSelected = item._index === selectedIndex;
                return (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => insertVariable(v.name)}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-white/5"
                    }`}
                  >
                    <code className="text-[11px] font-mono bg-white/5 px-1 rounded">
                      {v.name}
                    </code>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {v.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {showDropdown && filtered.length === 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-white/10 bg-zinc-900 shadow-xl"
        >
          <div className="px-2.5 py-2 text-[10px] text-muted-foreground">
            No matching variables
          </div>
        </div>
      )}
    </div>
  );
}
