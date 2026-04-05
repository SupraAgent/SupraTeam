"use client";

import * as React from "react";
import { MessageCircle, Star, Pin, StickyNote, Users, Hourglass } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import type { Conversation, Deal, InboxStatus, ChatLabel, InboxTab, ThreadMessage } from "./inbox-types";
import { COLOR_TAGS } from "./inbox-types";
import { TG_CHAT_DRAG_TYPE } from "@/components/inbox/tg-chat-group-panel";
import type { DragChatData } from "@/components/inbox/tg-chat-group-panel";

interface ConversationListItemProps {
  conv: Conversation;
  convIndex: number;
  chatDeals: Deal[];
  isSelected: boolean;
  highlightedIndex: number;
  status: InboxStatus | undefined;
  label: ChatLabel | undefined;
  teamMembers: { id: string; display_name: string }[];
  lastSeen: Record<number, string>;
  activeTab: InboxTab;
  onSelect: (chatId: number) => void;
  onContextMenu: (e: React.MouseEvent, chatId: number, groupName: string) => void;
}

export function ConversationListItem({
  conv, convIndex, chatDeals, isSelected, highlightedIndex, status, label,
  teamMembers, lastSeen, activeTab, onSelect, onContextMenu,
}: ConversationListItemProps) {
  const lastMsg = conv.messages[0];
  const assignee = status?.assigned_to
    ? teamMembers.find((m) => m.id === status.assigned_to)
    : null;
  const colorTag = label?.color_tag ? COLOR_TAGS.find((t) => t.key === label.color_tag) : null;
  const tagColor = colorTag?.color || label?.color_tag_color || null;

  // SLA: time since last customer (non-bot) message
  const lastCustomerMsg = conv.messages.find((m) => !m.is_from_bot);
  const slaMs = lastCustomerMsg ? Date.now() - new Date(lastCustomerMsg.sent_at).getTime() : null;
  const slaHours = slaMs ? slaMs / 3600000 : null;
  const slaColor = slaHours === null ? null : slaHours < 1 ? "text-emerald-400" : slaHours < 4 ? "text-amber-400" : "text-red-400";
  const slaLabel = slaHours === null ? null : slaHours < 1 ? `${Math.round(slaHours * 60)}m` : `${Math.round(slaHours)}h`;

  // Unread detection
  const seenAt = lastSeen[conv.chat_id];
  const neverSeen = !seenAt;
  const unreadCount = seenAt
    ? conv.messages.filter((m) => m.sent_at > seenAt).length +
      conv.messages.reduce((sum, m) => sum + (m.replies?.filter((r: ThreadMessage) => r.sent_at > seenAt).length ?? 0), 0)
    : conv.message_count;
  const hasUnread = (unreadCount > 0 || neverSeen) && !isSelected;

  return (
    <button
      draggable
      onDragStart={(e) => {
        const dragData: DragChatData = {
          chatId: conv.chat_id,
          chatTitle: conv.group_name,
        };
        e.dataTransfer.setData(TG_CHAT_DRAG_TYPE, JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onSelect(conv.chat_id)}
      onContextMenu={(e) => onContextMenu(e, conv.chat_id, conv.group_name)}
      className={cn(
        "w-full text-left px-3 py-2.5 transition-colors cursor-grab active:cursor-grabbing",
        isSelected ? "bg-primary/10" :
        convIndex === highlightedIndex ? "bg-white/[0.06] ring-1 ring-primary/30" :
        label?.is_vip ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]" :
        "hover:bg-white/[0.04]",
        label?.is_muted && "opacity-50"
      )}
      style={tagColor && !label?.is_vip ? { borderLeftWidth: 3, borderLeftColor: tagColor } : undefined}
    >
      <div className="flex items-center gap-2 mb-0.5">
        {hasUnread ? (
          <span className="h-2 w-2 rounded-full bg-primary shrink-0" title={`${unreadCount} unread`} />
        ) : (
          <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        {label?.is_vip && <Star className="h-3 w-3 text-amber-400 shrink-0" />}
        {label?.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
        <span className={cn(
          "text-sm truncate",
          hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground",
          label?.is_vip && "text-amber-200"
        )}>{conv.group_name}</span>
        {hasUnread && (
          <span className={cn(
            "rounded-full text-[10px] font-bold px-1.5 py-0.5 shrink-0",
            label?.is_vip ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary"
          )}>
            {neverSeen ? "new" : unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {!status?.assigned_to && status?.status !== "closed" && (
          <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Unassigned" />
        )}
        {conv.member_count && (
          <span className="text-[10px] text-muted-foreground/50 shrink-0 flex items-center gap-0.5 ml-auto">
            <Users className="h-2.5 w-2.5" />
            {conv.member_count}
          </span>
        )}
      </div>

      {/* Color tag + note indicator */}
      {(colorTag || label?.note) && (
        <div className="flex items-center gap-1 pl-5 mb-0.5">
          {colorTag && (
            <span className="rounded px-1 py-0 text-[9px] font-medium" style={{ backgroundColor: `${tagColor}20`, color: tagColor || undefined }}>
              {colorTag.label}
            </span>
          )}
          {label?.note && <StickyNote className="h-2.5 w-2.5 text-yellow-500/60 shrink-0" />}
        </div>
      )}

      {lastMsg && (
        <p className="text-[11px] text-muted-foreground truncate pl-5">
          <span className="text-foreground/70">{lastMsg.sender_name.split(" ")[0]}:</span>{" "}
          {lastMsg.message_text?.slice(0, 80) ?? "(media)"}
        </p>
      )}

      <div className="flex items-center gap-2 pl-5 mt-0.5">
        {conv.latest_at && (
          <span className="text-[10px] text-muted-foreground/50">{timeAgo(conv.latest_at)}</span>
        )}
        {slaLabel && status?.status !== "closed" && (
          <span
            className={cn(
              "font-medium",
              slaHours && slaHours >= 4
                ? "text-[10px] rounded-full px-1.5 py-0.5 bg-red-500/15 text-red-400"
                : cn("text-[10px]", slaColor)
            )}
            title="Time since last customer message"
          >
            {slaHours && slaHours >= 4 ? `⏱ ${slaLabel}` : slaLabel}
          </span>
        )}
        {activeTab === "awaiting_reply" && lastCustomerMsg && (
          <span className="text-[10px] text-orange-400/70 flex items-center gap-0.5" title="Awaiting reply since">
            <Hourglass className="h-2.5 w-2.5" />
            {timeAgo(lastCustomerMsg.sent_at)}
          </span>
        )}
        {assignee && (
          <span className="text-[10px] text-primary/60 truncate max-w-[80px]">{assignee.display_name}</span>
        )}
        {chatDeals.length > 0 && (
          <span className="text-[10px] text-primary/70 ml-auto">
            {chatDeals.length} deal{chatDeals.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </button>
  );
}
