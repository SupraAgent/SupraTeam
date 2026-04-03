/**
 * Hook for the "Message Nuke" operation — deletes all your messages
 * with a user across DMs and all shared group chats.
 * All operations run client-side via GramJS.
 */

"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";

export interface NukeMessagesState {
  status: "idle" | "scanning" | "deleting" | "done" | "error" | "cancelled";
  phase: string;
  totalFound: number;
  totalDeleted: number;
  currentChat: string;
  chatsProcessed: number;
  chatsTotal: number;
  error: string | null;
}

const INITIAL_STATE: NukeMessagesState = {
  status: "idle",
  phase: "",
  totalFound: 0,
  totalDeleted: 0,
  currentChat: "",
  chatsProcessed: 0,
  chatsTotal: 0,
  error: null,
};

export function useNukeMessages() {
  const { service, status: tgStatus } = useTelegram();
  const [state, setState] = React.useState<NukeMessagesState>(INITIAL_STATE);
  const cancelledRef = React.useRef(false);

  const reset = React.useCallback(() => {
    setState(INITIAL_STATE);
    cancelledRef.current = false;
  }, []);

  const cancel = React.useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const start = React.useCallback(
    async (
      userId: number,
      userAccessHash: string,
      userName: string
    ) => {
      if (tgStatus !== "connected") return;
      cancelledRef.current = false;

      const allMessages: Array<{
        peerType: "user" | "chat" | "channel";
        peerId: number;
        accessHash?: string;
        messageIds: number[];
        chatName: string;
      }> = [];

      try {
        // Phase 1: Scan DM
        setState((s) => ({
          ...s,
          status: "scanning",
          phase: `Scanning DM with ${userName}...`,
          currentChat: userName,
        }));

        const dmIdSet = new Set<number>();
        let offsetId = 0;
        let hasMore = true;
        while (hasMore && !cancelledRef.current) {
          const result = await service.searchMyMessages("user", userId, userAccessHash, offsetId);
          let newCount = 0;
          for (const id of result.messageIds) {
            if (!dmIdSet.has(id)) { dmIdSet.add(id); newCount++; }
          }
          hasMore = result.hasMore;
          offsetId = result.nextOffsetId;
          if (newCount > 0) setState((s) => ({ ...s, totalFound: s.totalFound + newCount }));
        }
        const dmIds = Array.from(dmIdSet);

        if (dmIds.length > 0) {
          allMessages.push({
            peerType: "user",
            peerId: userId,
            accessHash: userAccessHash,
            messageIds: dmIds,
            chatName: `DM: ${userName}`,
          });
        }

        if (cancelledRef.current) {
          setState((s) => ({ ...s, status: "cancelled", phase: "Cancelled" }));
          return;
        }

        // Phase 2: Find common chats
        setState((s) => ({ ...s, phase: "Finding shared groups..." }));
        const commonChats = await service.getCommonChats(userId, userAccessHash);

        setState((s) => ({
          ...s,
          chatsTotal: commonChats.length + 1, // +1 for DM
          chatsProcessed: 1, // DM done
        }));

        // Phase 3: Scan each common chat
        for (const chat of commonChats) {
          if (cancelledRef.current) break;

          setState((s) => ({
            ...s,
            phase: `Scanning ${chat.title}...`,
            currentChat: chat.title,
          }));

          const peerType = chat.type === "group" ? "chat" as const : "channel" as const;
          const chatIdSet = new Set<number>();
          let chatOffset = 0;
          let chatHasMore = true;

          while (chatHasMore && !cancelledRef.current) {
            try {
              const result = await service.searchMyMessages(peerType, chat.id, chat.accessHash, chatOffset);
              let newCount = 0;
              for (const id of result.messageIds) {
                if (!chatIdSet.has(id)) { chatIdSet.add(id); newCount++; }
              }
              chatHasMore = result.hasMore;
              chatOffset = result.nextOffsetId;
              if (newCount > 0) setState((s) => ({ ...s, totalFound: s.totalFound + newCount }));
            } catch {
              break;
            }
          }
          const chatIds = Array.from(chatIdSet);

          if (chatIds.length > 0) {
            allMessages.push({
              peerType,
              peerId: chat.id,
              accessHash: chat.accessHash,
              messageIds: chatIds,
              chatName: chat.title,
            });
          }

          setState((s) => ({ ...s, chatsProcessed: s.chatsProcessed + 1 }));
        }

        if (cancelledRef.current) {
          setState((s) => ({ ...s, status: "cancelled", phase: "Cancelled" }));
          return;
        }

        // Phase 4: Delete all messages
        setState((s) => ({ ...s, status: "deleting", phase: "Deleting messages..." }));

        for (const chat of allMessages) {
          if (cancelledRef.current) break;

          setState((s) => ({
            ...s,
            phase: `Deleting from ${chat.chatName}...`,
            currentChat: chat.chatName,
          }));

          // Delete in batches of 100
          for (let i = 0; i < chat.messageIds.length; i += 100) {
            if (cancelledRef.current) break;
            const batch = chat.messageIds.slice(i, i + 100);
            let retries = 0;
            const MAX_RETRIES = 3;
            let success = false;
            while (!success && retries < MAX_RETRIES && !cancelledRef.current) {
              try {
                const deleted = await service.deleteMessages(
                  chat.peerType,
                  chat.peerId,
                  chat.accessHash,
                  batch
                );
                setState((s) => ({ ...s, totalDeleted: s.totalDeleted + deleted }));
                success = true;
              } catch (err) {
                const msg = err instanceof Error ? err.message : "";
                const floodMatch = msg.match(/FLOOD_WAIT_(\d+)/i);
                if (floodMatch) {
                  retries++;
                  const wait = parseInt(floodMatch[1], 10);
                  setState((s) => ({ ...s, phase: `Rate limited, waiting ${wait}s... (retry ${retries}/${MAX_RETRIES})` }));
                  await new Promise((r) => setTimeout(r, wait * 1000));
                } else {
                  break; // Skip batch on non-flood errors
                }
              }
            }
          }
        }

        setState((s) => ({
          ...s,
          status: cancelledRef.current ? "cancelled" : "done",
          phase: cancelledRef.current ? "Cancelled" : "Complete",
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          phase: "Error",
          error: err instanceof Error ? err.message : "An error occurred",
        }));
      }
    },
    [service, tgStatus]
  );

  return { state, start, cancel, reset };
}
