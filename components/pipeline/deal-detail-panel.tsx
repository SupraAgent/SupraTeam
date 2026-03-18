"use client";

import * as React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Deal } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

type DealDetailPanelProps = {
  deal: Deal | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

export function DealDetailPanel({ deal, open, onClose, onDeleted }: DealDetailPanelProps) {
  const [deleting, setDeleting] = React.useState(false);

  if (!deal) return null;

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted();
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title={deal.deal_name}>
      <div className="space-y-5">
        {/* Board + Stage */}
        <div className="flex items-center gap-2">
          <span className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            deal.board_type === "BD" && "bg-blue-500/20 text-blue-400",
            deal.board_type === "Marketing" && "bg-purple-500/20 text-purple-400",
            deal.board_type === "Admin" && "bg-orange-500/20 text-orange-400",
          )}>
            {deal.board_type}
          </span>
          {deal.stage && (
            <Badge>
              <span
                className="mr-1.5 h-1.5 w-1.5 rounded-full inline-block"
                style={{ backgroundColor: deal.stage.color ?? "#666" }}
              />
              {deal.stage.name}
            </Badge>
          )}
        </div>

        {/* Details */}
        <div className="space-y-3">
          <DetailRow label="Value" value={deal.value != null ? `$${Number(deal.value).toLocaleString()}` : "Not set"} />
          <DetailRow label="Probability" value={deal.probability != null ? `${deal.probability}%` : "Not set"} />
          <DetailRow label="Stage changed" value={deal.stage_changed_at ? timeAgo(deal.stage_changed_at) : "Never"} />
          <DetailRow label="Created" value={timeAgo(deal.created_at)} />
        </div>

        {/* Contact */}
        {deal.contact && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Contact</p>
            <p className="text-sm font-medium text-foreground">{deal.contact.name}</p>
            {deal.contact.company && (
              <p className="text-xs text-muted-foreground">{deal.contact.company}</p>
            )}
            {deal.contact.telegram_username && (
              <p className="text-xs text-primary mt-1">@{deal.contact.telegram_username}</p>
            )}
          </div>
        )}

        {/* Telegram */}
        {deal.telegram_chat_link && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Telegram Chat</p>
            <a
              href={deal.telegram_chat_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {deal.telegram_chat_name || deal.telegram_chat_link}
            </a>
          </div>
        )}

        {/* Assigned */}
        {deal.assigned_profile && (
          <div className="flex items-center gap-2">
            <img
              src={deal.assigned_profile.avatar_url}
              alt=""
              className="h-6 w-6 rounded-full"
            />
            <span className="text-sm text-foreground">{deal.assigned_profile.display_name}</span>
          </div>
        )}

        {/* Actions */}
        <div className="pt-4 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            {deleting ? "Deleting..." : "Delete Deal"}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
