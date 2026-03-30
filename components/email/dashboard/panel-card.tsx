"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { DashboardPanel } from "@/lib/plugins/types";

interface PanelCardProps {
  panel: DashboardPanel;
  onRemove: () => void;
  children: React.ReactNode;
  className?: string;
}

export function PanelCard({
  panel,
  onRemove,
  children,
  className,
}: PanelCardProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const Icon = panel.icon;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-white/[0.035] overflow-hidden",
        panel.size === "full" && "col-span-full",
        panel.size === "2x1" && "col-span-full lg:col-span-2",
        panel.size === "1x1" && "col-span-full sm:col-span-1",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">{panel.title}</span>
        <div className="ml-auto">
          <button
            onClick={onRemove}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
            title="Remove panel"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
}
