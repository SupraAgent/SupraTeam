"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { AlertTriangle, Loader2, CheckCircle2, XCircle, Flame, UserX, Users } from "lucide-react";
import type { NukeMessagesState } from "@/lib/client/use-nuke-messages";
import type { NukeGroupsState } from "@/lib/client/use-nuke-groups";
import type { TgAdminGroup } from "@/lib/client/telegram-service";

type NukeType = "messages" | "groups";

interface NukeProgressModalProps {
  open: boolean;
  onClose: () => void;
  type: NukeType;
  targetName: string;
  /** Message nuke state */
  messagesState?: NukeMessagesState;
  /** Group nuke state */
  groupsState?: NukeGroupsState;
  /** Admin groups for selective group nuke */
  adminGroups?: TgAdminGroup[];
  onConfirm: (selectedGroups?: TgAdminGroup[]) => void;
  onCancel: () => void;
}

export function NukeProgressModal({
  open,
  onClose,
  type,
  targetName,
  messagesState,
  groupsState,
  adminGroups,
  onConfirm,
  onCancel,
}: NukeProgressModalProps) {
  const [confirmText, setConfirmText] = React.useState("");
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Set<number>>(new Set());

  const isIdle = type === "messages"
    ? !messagesState || messagesState.status === "idle"
    : !groupsState || groupsState.status === "idle";

  const isRunning = type === "messages"
    ? messagesState?.status === "scanning" || messagesState?.status === "deleting"
    : groupsState?.status === "running";

  const isDone = type === "messages"
    ? messagesState?.status === "done" || messagesState?.status === "cancelled"
    : groupsState?.status === "done" || groupsState?.status === "cancelled";

  const isError = type === "messages"
    ? messagesState?.status === "error"
    : groupsState?.status === "error";

  const confirmMatch = confirmText.toLowerCase() === targetName.toLowerCase();

  // Initialize all groups as selected when modal opens
  React.useEffect(() => {
    if (!open) {
      setConfirmText("");
      setSelectedGroupIds(new Set());
    } else if (adminGroups) {
      setSelectedGroupIds(new Set(adminGroups.map((g) => g.telegramId)));
    }
  }, [open, adminGroups]);

  const toggleGroup = (id: number) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (adminGroups) {
      if (selectedGroupIds.size === adminGroups.length) {
        setSelectedGroupIds(new Set());
      } else {
        setSelectedGroupIds(new Set(adminGroups.map((g) => g.telegramId)));
      }
    }
  };

  const handleConfirm = () => {
    if (type === "groups" && adminGroups) {
      const selected = adminGroups.filter((g) => selectedGroupIds.has(g.telegramId));
      onConfirm(selected);
    } else {
      onConfirm();
    }
  };

  const title = type === "messages" ? "Delete All Messages" : "Kick from Groups";
  const Icon = type === "messages" ? Flame : UserX;

  return (
    <Modal open={open} onClose={isDone || isError ? onClose : () => {}} title={title}>
      {/* Confirmation state */}
      {isIdle && (
        <div className="space-y-4">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-red-400 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {type === "messages"
                ? `Delete all your messages with ${targetName}?`
                : `Kick ${targetName} from selected groups?`}
            </div>
            <p className="text-xs text-muted-foreground">
              {type === "messages"
                ? "This will delete your messages in DMs and all shared group chats. This action cannot be undone."
                : "Select which groups to remove them from. They can rejoin via invite links."}
            </p>

            {/* Group selector for group nuke */}
            {type === "groups" && adminGroups && adminGroups.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Groups ({selectedGroupIds.size}/{adminGroups.length})
                  </span>
                  <button
                    onClick={toggleAll}
                    className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                  >
                    {selectedGroupIds.size === adminGroups.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02]">
                  {adminGroups.map((g) => (
                    <label
                      key={g.telegramId}
                      className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/[0.04] cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.has(g.telegramId)}
                        onChange={() => toggleGroup(g.telegramId)}
                        className="rounded border-white/20 bg-white/[0.04] text-primary focus:ring-primary/50 h-3.5 w-3.5"
                      />
                      <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-foreground truncate">{g.title}</span>
                    </label>
                  ))}
                </div>
                {adminGroups.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center py-2">
                    No admin groups found.
                  </p>
                )}
              </div>
            )}

            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Type "${targetName}" to confirm`}
              className="w-full rounded-lg border border-red-500/20 bg-white/[0.04] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-red-500/50"
              autoFocus={type === "messages"}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={!confirmMatch || (type === "groups" && selectedGroupIds.size === 0)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-30 min-h-[44px]"
            >
              <Icon className="h-3.5 w-3.5" />
              {type === "messages"
                ? "Delete Messages"
                : `Kick from ${selectedGroupIds.size} Group${selectedGroupIds.size !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/5 text-muted-foreground text-xs hover:bg-white/10 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Running state */}
      {isRunning && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-red-400" />
            <span>{type === "messages" ? messagesState?.phase : `Kicking from ${groupsState?.currentGroup}...`}</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-red-400 transition-all duration-300"
              style={{
                width: `${
                  type === "messages"
                    ? messagesState?.chatsTotal
                      ? (messagesState.chatsProcessed / messagesState.chatsTotal) * 100
                      : 10
                    : groupsState?.total
                      ? (groupsState.processed / groupsState.total) * 100
                      : 0
                }%`,
              }}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            {type === "messages" ? (
              <>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Found</p>
                  <p className="text-sm font-medium text-foreground">{messagesState?.totalFound ?? 0}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Deleted</p>
                  <p className="text-sm font-medium text-foreground">{messagesState?.totalDeleted ?? 0}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</p>
                  <p className="text-sm font-medium text-foreground truncate">{messagesState?.currentChat ?? "..."}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Chats</p>
                  <p className="text-sm font-medium text-foreground">
                    {messagesState?.chatsProcessed ?? 0} / {messagesState?.chatsTotal ?? "?"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Progress</p>
                  <p className="text-sm font-medium text-foreground">
                    {groupsState?.processed ?? 0} / {groupsState?.total ?? 0}
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</p>
                  <p className="text-sm font-medium text-foreground truncate">{groupsState?.currentGroup ?? "..."}</p>
                </div>
              </>
            )}
          </div>

          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-white/5 text-muted-foreground text-xs hover:bg-white/10 transition-colors min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Done / Error state */}
      {(isDone || isError) && (
        <div className="space-y-4">
          {type === "messages" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {messagesState?.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : messagesState?.status === "cancelled" ? (
                  <XCircle className="h-4 w-4 text-amber-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="font-medium text-foreground">
                  {messagesState?.status === "done"
                    ? "Complete"
                    : messagesState?.status === "cancelled"
                      ? "Cancelled"
                      : "Error"}
                </span>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                Deleted {messagesState?.totalDeleted ?? 0} of {messagesState?.totalFound ?? 0} messages
                across {messagesState?.chatsProcessed ?? 0} chats.
              </div>
              {messagesState?.error && (
                <p className="text-xs text-red-400">{messagesState.error}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {groupsState?.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : groupsState?.status === "cancelled" ? (
                  <XCircle className="h-4 w-4 text-amber-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="font-medium text-foreground">
                  {groupsState?.status === "done"
                    ? "Complete"
                    : groupsState?.status === "cancelled"
                      ? "Cancelled"
                      : "Error"}
                </span>
              </div>
              {groupsState?.error && (
                <p className="text-xs text-red-400">{groupsState.error}</p>
              )}
              {/* Per-group results */}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {groupsState?.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-white/[0.02]">
                    {r.success ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                    )}
                    <span className="text-foreground truncate">{r.groupName}</span>
                    {r.error && <span className="text-muted-foreground ml-auto shrink-0">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 text-muted-foreground text-xs hover:bg-white/10 transition-colors min-h-[44px]"
          >
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
