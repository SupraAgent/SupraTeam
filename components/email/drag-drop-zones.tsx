"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Archive, Ban } from "lucide-react";

interface DragDropZonesProps {
  visible: boolean;
  onArchive: (threadIds: string[]) => void;
  onBlock: (threadIds: string[]) => void;
}

export function DragDropZones({ visible, onArchive, onBlock }: DragDropZonesProps) {
  const [archiveHover, setArchiveHover] = React.useState(false);
  const [blockHover, setBlockHover] = React.useState(false);

  if (!visible) return null;

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, action: "archive" | "block") {
    e.preventDefault();
    setArchiveHover(false);
    setBlockHover(false);

    try {
      const data = e.dataTransfer.getData("application/x-thread-ids");
      if (!data) return;
      const threadIds: string[] = JSON.parse(data);
      if (action === "archive") onArchive(threadIds);
      else onBlock(threadIds);
    } catch { /* noop */ }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Archive drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragEnter={() => setArchiveHover(true)}
        onDragLeave={() => setArchiveHover(false)}
        onDrop={(e) => handleDrop(e, "archive")}
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-8 py-5 transition-all backdrop-blur-sm",
          archiveHover
            ? "border-green-400 bg-green-500/20 scale-110 shadow-lg shadow-green-500/20"
            : "border-white/20 bg-white/[0.06]"
        )}
      >
        <Archive className={cn(
          "h-6 w-6 transition-colors",
          archiveHover ? "text-green-400" : "text-muted-foreground"
        )} />
        <span className={cn(
          "text-xs font-medium transition-colors",
          archiveHover ? "text-green-400" : "text-muted-foreground"
        )}>
          Archive
        </span>
      </div>

      {/* Block drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragEnter={() => setBlockHover(true)}
        onDragLeave={() => setBlockHover(false)}
        onDrop={(e) => handleDrop(e, "block")}
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-8 py-5 transition-all backdrop-blur-sm",
          blockHover
            ? "border-red-400 bg-red-500/20 scale-110 shadow-lg shadow-red-500/20"
            : "border-white/20 bg-white/[0.06]"
        )}
      >
        <Ban className={cn(
          "h-6 w-6 transition-colors",
          blockHover ? "text-red-400" : "text-muted-foreground"
        )} />
        <span className={cn(
          "text-xs font-medium transition-colors",
          blockHover ? "text-red-400" : "text-muted-foreground"
        )}>
          Block Domain
        </span>
      </div>
    </div>
  );
}
