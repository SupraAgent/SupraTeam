"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import type { ThreadListItem } from "@/lib/email/types";
import { ContactAvatar } from "./contact-avatar";
import {
  CheckSquare,
  X,
  GripVertical,
  Inbox,
} from "lucide-react";

interface TodoItem {
  threadId: string;
  subject: string;
  from: { name?: string; email: string }[];
  lastMessageAt: string;
  addedAt: string;
}

interface TodoPanelProps {
  connectionId?: string;
  onSelectThread?: (threadId: string) => void;
}

const STORAGE_KEY = "email-todo-items";
const ORDER_KEY = "email-todo-order";

function loadTodos(): TodoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTodos(items: TodoItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* noop */ }
}

export function TodoPanel({ connectionId, onSelectThread }: TodoPanelProps) {
  const [items, setItems] = React.useState<TodoItem[]>(() => loadTodos());
  const [isDropTarget, setIsDropTarget] = React.useState(false);
  const [dropFlash, setDropFlash] = React.useState(false);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  // Persist on change
  React.useEffect(() => {
    saveTodos(items);
  }, [items]);

  function addThreads(threadIds: string[], threadData?: Map<string, Partial<TodoItem>>) {
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.threadId));
      const newItems = threadIds
        .filter((id) => !existing.has(id))
        .map((id) => {
          const data = threadData?.get(id);
          return {
            threadId: id,
            subject: data?.subject ?? "Untitled",
            from: data?.from ?? [{ email: "unknown" }],
            lastMessageAt: data?.lastMessageAt ?? new Date().toISOString(),
            addedAt: new Date().toISOString(),
          };
        });
      return [...prev, ...newItems];
    });
  }

  function removeItem(threadId: string) {
    setItems((prev) => prev.filter((i) => i.threadId !== threadId));
  }

  function handleReorder(from: number, to: number) {
    if (from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            To Do
          </h2>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({items.length})
            </span>
          )}
        </div>
      </div>

      {/* Drop zone + items list */}
      <div
        className={cn(
          "flex-1 overflow-y-auto thin-scroll transition-colors",
          dropFlash
            ? "bg-green-500/10 ring-1 ring-inset ring-green-500/30"
            : isDropTarget
              ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
              : ""
        )}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-thread-ids")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setIsDropTarget(true);
          }
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the container itself
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDropTarget(false);
          }
        }}
        onDrop={async (e) => {
          e.preventDefault();
          setIsDropTarget(false);
          const raw = e.dataTransfer.getData("application/x-thread-ids");
          if (!raw) return;
          try {
            const ids = JSON.parse(raw) as string[];
            // Fetch thread details for display
            const threadData = new Map<string, Partial<TodoItem>>();
            const existingIds = new Set(items.map((i) => i.threadId));
            const newIds = ids.filter((id) => !existingIds.has(id));
            if (newIds.length === 0) return;

            // Fetch thread metadata for each new item
            for (const id of newIds) {
              try {
                const params = new URLSearchParams({ id });
                if (connectionId) params.set("connectionId", connectionId);
                const res = await fetch(`/api/email/threads/${id}?${params}`);
                if (res.ok) {
                  const json = await res.json();
                  const thread = json.thread;
                  if (thread) {
                    threadData.set(id, {
                      subject: thread.subject,
                      from: thread.from,
                      lastMessageAt: thread.lastMessageAt,
                    });
                  }
                }
              } catch { /* use defaults */ }
            }

            addThreads(ids, threadData);
            setDropFlash(true);
            setTimeout(() => setDropFlash(false), 600);
          } catch { /* ignore */ }
        }}
      >
        {items.length === 0 ? (
          <div className="px-3 py-10 text-center text-muted-foreground/50 text-xs flex flex-col items-center gap-2">
            <Inbox className="h-8 w-8 opacity-30" />
            <p>Drag emails here to deal with later</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {items.map((item, index) => (
              <div
                key={item.threadId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-todo-reorder", String(index));
                  e.dataTransfer.effectAllowed = "move";
                  setDragIndex(index);
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes("application/x-todo-reorder")) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverIndex(index);
                  }
                }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => {
                  const fromStr = e.dataTransfer.getData("application/x-todo-reorder");
                  if (fromStr === "") return;
                  e.preventDefault();
                  e.stopPropagation();
                  handleReorder(Number(fromStr), index);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                className={cn(
                  dragIndex === index && "opacity-40",
                  dragOverIndex === index && dragIndex !== index && "border-t-2 border-primary"
                )}
              >
                <TodoItemRow
                  item={item}
                  onClick={() => onSelectThread?.(item.threadId)}
                  onRemove={() => removeItem(item.threadId)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TodoItemRow({
  item,
  onClick,
  onRemove,
}: {
  item: TodoItem;
  onClick?: () => void;
  onRemove: () => void;
}) {
  const sender = item.from[0]?.name || item.from[0]?.email || "Unknown";

  return (
    <div
      className="group w-full text-left rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/15 transition p-3 flex gap-2.5 cursor-grab active:cursor-grabbing"
    >
      <div className="shrink-0 pt-0.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition">
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <div className="shrink-0 pt-0.5">
        <ContactAvatar
          email={item.from[0]?.email ?? ""}
          name={item.from[0]?.name}
          size={24}
        />
      </div>
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground/80 truncate">
            {sender}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {timeAgo(item.lastMessageAt)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {item.subject}
        </p>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="opacity-0 group-hover:opacity-100 shrink-0 self-center rounded p-0.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
        title="Remove from To Do"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
