"use client";

import * as React from "react";
import type { Node } from "@xyflow/react";

type ExpressionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** All nodes in the canvas (for autocomplete) */
  nodes: Node[];
  /** Placeholder text */
  placeholder?: string;
  /** Number of rows for textarea */
  rows?: number;
  /** Additional CSS class */
  className?: string;
};

type Suggestion = {
  text: string;
  display: string;
  description: string;
};

/**
 * Expression editor with {{nodeId.output}} autocomplete.
 * Shows a dropdown of available upstream nodes when user types "{{".
 */
export function ExpressionEditor({
  value,
  onChange,
  nodes,
  placeholder = "Enter expression...",
  rows = 3,
  className = "",
}: ExpressionEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [insertPosition, setInsertPosition] = React.useState<{ start: number; end: number } | null>(null);

  // Build suggestion list from available nodes
  const allSuggestions = React.useMemo((): Suggestion[] => {
    return nodes
      .filter((n) => n.type !== "noteNode")
      .map((n) => {
        const data = n.data as Record<string, unknown>;
        const label = (data.label as string) || n.id;
        const type = n.type ?? "unknown";
        return {
          text: `${n.id}.output`,
          display: `${label}`,
          description: type.replace("Node", ""),
        };
      });
  }, [nodes]);

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    onChange(newValue);

    // Check if cursor is inside a {{ }} block
    const cursorPos = e.target.selectionStart;
    const textBefore = newValue.slice(0, cursorPos);
    const lastOpen = textBefore.lastIndexOf("{{");
    const lastClose = textBefore.lastIndexOf("}}");

    if (lastOpen > lastClose) {
      // We're inside a {{ block — show suggestions
      const query = textBefore.slice(lastOpen + 2).toLowerCase();
      const filtered = allSuggestions.filter(
        (s) =>
          s.display.toLowerCase().includes(query) ||
          s.text.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query)
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setSelectedIndex(0);
      setInsertPosition({ start: lastOpen + 2, end: cursorPos });
    } else {
      setShowSuggestions(false);
    }
  }

  function applySuggestion(suggestion: Suggestion) {
    if (!insertPosition || !textareaRef.current) return;

    // Check if there's already a closing }} (possibly with whitespace before it)
    const afterInsert = value.slice(insertPosition.end);
    const closeMatch = afterInsert.match(/^\s*\}\}/);
    const hasClose = closeMatch !== null;

    const before = value.slice(0, insertPosition.start);
    const after = hasClose
      ? value.slice(insertPosition.end + closeMatch![0].length)
      : value.slice(insertPosition.end);
    const insertion = `${suggestion.text}}}`;
    const newValue = before + insertion + after;

    onChange(newValue);
    setShowSuggestions(false);

    // Move cursor after the insertion
    const newCursorPos = insertPosition.start + insertion.length;
    setTimeout(() => {
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      textareaRef.current?.focus();
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showSuggestions) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (suggestions[selectedIndex]) {
        e.preventDefault();
        applySuggestion(suggestions[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  const baseClass = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono";

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        rows={rows}
        className={`${baseClass} resize-none ${className}`}
      />

      {/* Hint */}
      <div className="mt-1 text-[10px] text-muted-foreground/40">
        Type <code className="bg-white/5 px-1 rounded text-[9px]">{"{{"}</code> to reference node outputs
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-neutral-900/98 shadow-xl backdrop-blur-md">
          {suggestions.map((s, i) => (
            <button
              key={s.text}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                applySuggestion(s);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                i === selectedIndex
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              <span className="font-mono text-primary/80">{`{{${s.text}}}`}</span>
              <span className="text-[10px] text-muted-foreground/60">— {s.display} ({s.description})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
