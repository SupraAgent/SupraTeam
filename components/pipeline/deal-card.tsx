"use client";

import { Draggable } from "@hello-pangea/dnd";
import type { Deal } from "@/lib/types";
import { cn } from "@/lib/utils";

type DealCardProps = {
  deal: Deal;
  index: number;
  onClick: () => void;
};

export function DealCard({ deal, index, onClick }: DealCardProps) {
  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={cn(
            "rounded-lg border border-white/10 bg-white/[0.04] p-3 cursor-pointer transition-colors hover:bg-white/[0.07]",
            snapshot.isDragging && "shadow-lg border-primary/30 bg-white/[0.08]"
          )}
        >
          <p className="text-sm font-medium text-foreground truncate">{deal.deal_name}</p>

          {deal.contact && (
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {deal.contact.name}
              {deal.contact.company && ` - ${deal.contact.company}`}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              deal.board_type === "BD" && "bg-blue-500/20 text-blue-400",
              deal.board_type === "Marketing" && "bg-purple-500/20 text-purple-400",
              deal.board_type === "Admin" && "bg-orange-500/20 text-orange-400",
            )}>
              {deal.board_type}
            </span>

            {deal.value != null && deal.value > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ${Number(deal.value).toLocaleString()}
              </span>
            )}

            {deal.assigned_profile && (
              <img
                src={deal.assigned_profile.avatar_url}
                alt={deal.assigned_profile.display_name}
                title={deal.assigned_profile.display_name}
                className="ml-auto h-5 w-5 rounded-full"
              />
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
