"use client";

import * as React from "react";
import type { PanelId } from "@/lib/plugins/types";
import { getPanelById } from "@/lib/plugins/registry";

interface PlaceholderPanelProps {
  panelId: PanelId;
}

export function PlaceholderPanel({ panelId }: PlaceholderPanelProps) {
  const panel = getPanelById(panelId);
  if (!panel) return null;
  const Icon = panel.icon;

  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
      <Icon className="h-8 w-8 opacity-20" />
      <p className="text-xs">{panel.description}</p>
      <span className="text-[10px] opacity-50">Coming soon</span>
    </div>
  );
}
