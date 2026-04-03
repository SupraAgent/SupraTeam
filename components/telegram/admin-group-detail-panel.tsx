"use client";

import * as React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { useTelegram } from "@/lib/client/telegram-context";
import { useTelegramGroupParticipants } from "@/lib/client/use-telegram-group-participants";
import { useTelegramAdminGroups } from "@/lib/client/use-telegram-admin-groups";
import { useNukeMessages } from "@/lib/client/use-nuke-messages";
import { useNukeGroups } from "@/lib/client/use-nuke-groups";
import { NukeProgressModal } from "./nuke-progress-modal";
import type { TgAdminGroup } from "@/lib/client/telegram-service";
import { toast } from "sonner";
import {
  RefreshCw,
  Loader2,
  Shield,
  Crown,
  UserMinus,
  Trash2,
  AlertTriangle,
  Users,
  Flame,
  UserX,
  Search,
} from "lucide-react";

interface AdminGroupDetailPanelProps {
  group: TgAdminGroup | null;
  open: boolean;
  onClose: () => void;
}

export function AdminGroupDetailPanel({ group, open, onClose }: AdminGroupDetailPanelProps) {
  const { service } = useTelegram();
  const { groups: adminGroups } = useTelegramAdminGroups();
  const { participants, loading, refresh } = useTelegramGroupParticipants(
    group?.type ?? null,
    group?.telegramId ?? null,
    group?.accessHash
  );

  const [selfId, setSelfId] = React.useState<number | null>(null);
  const [kickingUser, setKickingUser] = React.useState<number | null>(null);
  const [memberSearch, setMemberSearch] = React.useState("");
  const [confirmKick, setConfirmKick] = React.useState<{
    userId: number;
    accessHash?: string;
    name: string;
  } | null>(null);

  // Nuke state
  const [nukeTarget, setNukeTarget] = React.useState<{
    userId: number;
    accessHash?: string;
    name: string;
    type: "messages" | "groups";
  } | null>(null);

  const nukeMessages = useNukeMessages();
  const nukeGroups = useNukeGroups();

  React.useEffect(() => {
    service.getSelfId().then(setSelfId).catch(() => {});
  }, [service]);

  const handleKick = async (userId: number, accessHash: string | undefined, name: string) => {
    if (!group) return;
    setKickingUser(userId);
    try {
      await service.kickGroupMember(group.type, group.telegramId, group.accessHash, userId, accessHash);
      toast.success(`Removed ${name} from ${group.title}`);
      refresh();
    } catch (err) {
      toast.error(`Failed to remove ${name}: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setKickingUser(null);
      setConfirmKick(null);
    }
  };

  const handleNukeConfirm = (selectedGroups?: TgAdminGroup[]) => {
    if (!nukeTarget) return;
    if (nukeTarget.type === "messages") {
      nukeMessages.start(nukeTarget.userId, nukeTarget.accessHash ?? "", nukeTarget.name);
    } else {
      nukeGroups.start(nukeTarget.userId, nukeTarget.accessHash, selectedGroups ?? adminGroups);
    }
  };

  const handleNukeClose = () => {
    setNukeTarget(null);
    nukeMessages.reset();
    nukeGroups.reset();
  };

  if (!group) return null;

  return (
    <>
      <SlideOver open={open} onClose={onClose} title={group.title}>
        <div className="space-y-5">
          {/* Group info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-400">
                {group.type === "supergroup" ? "Supergroup" : "Group"}
              </span>
              {group.isCreator && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400">
                  <Crown className="h-2.5 w-2.5" /> Creator
                </span>
              )}
              {!group.isCreator && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400">
                  <Shield className="h-2.5 w-2.5" /> Admin
                </span>
              )}
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Telegram ID</span>
              <span className="text-foreground text-[10px] font-mono">{group.telegramId}</span>
            </div>
            {group.username && (
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Username</span>
                <span className="text-foreground">@{group.username}</span>
              </div>
            )}
          </div>

          {/* Members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Users className="h-3.5 w-3.5" />
                Members ({participants.length})
              </div>
              <button
                onClick={refresh}
                disabled={loading}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Member search */}
            {participants.length > 10 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search members..."
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            )}

            {loading && participants.length === 0 && (
              <div className="space-y-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-white/[0.02] animate-pulse" />
                ))}
              </div>
            )}

            <div className="max-h-[400px] overflow-y-auto space-y-0.5">
              {participants.filter((p) => {
                if (!memberSearch) return true;
                const q = memberSearch.toLowerCase();
                const name = [p.firstName, p.lastName].filter(Boolean).join(" ").toLowerCase();
                return name.includes(q) || p.username?.toLowerCase().includes(q);
              }).map((p) => {
                const isSelf = p.telegramUserId === selfId;
                const isProtected = p.role === "creator" || isSelf;
                const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || `User ${p.telegramUserId}`;
                const isKicking = kickingUser === p.telegramUserId;

                return (
                  <div
                    key={p.telegramUserId}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03] group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {name}
                          {isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
                        </p>
                        {p.username && (
                          <p className="text-[10px] text-muted-foreground truncate">@{p.username}</p>
                        )}
                      </div>
                      {p.role === "creator" && (
                        <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/10 text-amber-400 shrink-0">
                          <Crown className="h-2 w-2" /> Owner
                        </span>
                      )}
                      {p.role === "admin" && (
                        <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium bg-blue-500/10 text-blue-400 shrink-0">
                          <Shield className="h-2 w-2" /> Admin
                        </span>
                      )}
                    </div>

                    {!isProtected && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Nuke messages */}
                        <button
                          onClick={() =>
                            setNukeTarget({
                              userId: p.telegramUserId,
                              accessHash: p.accessHash,
                              name,
                              type: "messages",
                            })
                          }
                          title="Delete all your messages with this user"
                          className="p-2 rounded text-muted-foreground/30 hover:text-orange-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Flame className="h-3.5 w-3.5" />
                        </button>
                        {/* Kick from this group */}
                        <button
                          onClick={() =>
                            setConfirmKick({ userId: p.telegramUserId, accessHash: p.accessHash, name })
                          }
                          disabled={isKicking}
                          title="Kick from this group"
                          className="p-2 rounded text-muted-foreground/30 hover:text-red-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          {isKicking ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserMinus className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {/* Nuke from all groups */}
                        <button
                          onClick={() =>
                            setNukeTarget({
                              userId: p.telegramUserId,
                              accessHash: p.accessHash,
                              name,
                              type: "groups",
                            })
                          }
                          title="Kick from all groups"
                          className="p-2 rounded text-muted-foreground/30 hover:text-red-500 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {participants.length === 0 && !loading && (
                <p className="text-[10px] text-muted-foreground/50 text-center py-2">
                  Click refresh to load members.
                </p>
              )}
            </div>

            {/* Kick confirmation */}
            {confirmKick && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-red-400 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Remove {confirmKick.name} from {group.title}?
                </div>
                <p className="text-[11px] text-muted-foreground">They can rejoin via invite link.</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleKick(confirmKick.userId, confirmKick.accessHash, confirmKick.name)}
                    disabled={kickingUser !== null}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-30 min-h-[44px]"
                  >
                    {kickingUser !== null && <Loader2 className="h-3 w-3 animate-spin" />}
                    Remove
                  </button>
                  <button
                    onClick={() => setConfirmKick(null)}
                    className="px-4 py-2 rounded-lg bg-white/5 text-muted-foreground text-xs hover:bg-white/10 transition-colors min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SlideOver>

      {/* Nuke modal */}
      {nukeTarget && (
        <NukeProgressModal
          open={!!nukeTarget}
          onClose={handleNukeClose}
          type={nukeTarget.type}
          targetName={nukeTarget.name}
          messagesState={nukeTarget.type === "messages" ? nukeMessages.state : undefined}
          groupsState={nukeTarget.type === "groups" ? nukeGroups.state : undefined}
          adminGroups={nukeTarget.type === "groups" ? adminGroups : undefined}
          onConfirm={handleNukeConfirm}
          onCancel={nukeTarget.type === "messages" ? nukeMessages.cancel : nukeGroups.cancel}
        />
      )}
    </>
  );
}
