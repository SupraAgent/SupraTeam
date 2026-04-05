import * as React from "react";
import type { Conversation } from "./inbox-types";

interface KeyboardRefs {
  conversations: React.RefObject<Conversation[]>;
  filtered: React.RefObject<Conversation[]>;
  selectedChat: React.RefObject<number | null>;
  currentUserId: React.RefObject<string | null>;
  highlightedIndex: React.RefObject<number>;
  showShortcutHelp: React.RefObject<boolean>;
  showScheduleMenu: React.RefObject<boolean>;
  showCanned: React.RefObject<boolean>;
  aiSummary: React.RefObject<string | null>;
  replyTextarea: React.RefObject<HTMLTextAreaElement | null>;
  searchInput: React.RefObject<HTMLInputElement | null>;
}

interface KeyboardActions {
  setShowShortcutHelp: React.Dispatch<React.SetStateAction<boolean>>;
  setShowScheduleMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCanned: React.Dispatch<React.SetStateAction<boolean>>;
  setAiSummary: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedChat: React.Dispatch<React.SetStateAction<number | null>>;
  setHighlightedIndex: React.Dispatch<React.SetStateAction<number>>;
  handleAssign: (chatId: number, userId: string | null) => void;
  handleStatusChange: (chatId: number, status: string, snoozedUntil?: string) => void;
  toggleLabel: (chatId: number, groupName: string, field: "is_vip" | "is_archived" | "is_pinned" | "is_muted") => void;
  handleSelectChat: (chatId: number) => void;
}

export function useInboxKeyboardShortcuts(refs: KeyboardRefs, actions: KeyboardActions) {
  // Stable refs for actions to avoid stale closures
  const handleAssignRef = React.useRef(actions.handleAssign);
  handleAssignRef.current = actions.handleAssign;
  const handleStatusChangeRef = React.useRef(actions.handleStatusChange);
  handleStatusChangeRef.current = actions.handleStatusChange;
  const toggleLabelRef = React.useRef(actions.toggleLabel);
  toggleLabelRef.current = actions.toggleLabel;
  const handleSelectChatRef = React.useRef(actions.handleSelectChat);
  handleSelectChatRef.current = actions.handleSelectChat;

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      // ? toggles help when not typing in a textarea or contentEditable
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        if (target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return;
        e.preventDefault();
        actions.setShowShortcutHelp((p) => !p);
        return;
      }

      // Escape works everywhere
      if (e.key === "Escape") {
        if (refs.showShortcutHelp.current) { actions.setShowShortcutHelp(false); return; }
        if (refs.showScheduleMenu.current) { actions.setShowScheduleMenu(false); return; }
        if (refs.showCanned.current) { actions.setShowCanned(false); return; }
        if (refs.aiSummary.current) { actions.setAiSummary(null); return; }
        if (refs.selectedChat.current) { actions.setSelectedChat(null); return; }
        return;
      }

      // Skip shortcuts when typing in input/textarea
      if (isInput) return;

      const chat = refs.selectedChat.current;
      const userId = refs.currentUserId.current;
      const currentFiltered = refs.filtered.current;
      const selectedConv = chat
        ? refs.conversations.current.find((c) => c.chat_id === chat)
        : null;

      // Shift+A — assign to me
      if (e.key === "A" && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (chat && userId) {
          e.preventDefault();
          handleAssignRef.current(chat, userId);
        }
        return;
      }

      switch (e.key) {
        case "j": {
          e.preventDefault();
          actions.setHighlightedIndex((prev) => Math.min(prev + 1, currentFiltered.length - 1));
          break;
        }
        case "k": {
          e.preventDefault();
          actions.setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "Enter": {
          const idx = refs.highlightedIndex.current;
          if (idx >= 0 && idx < currentFiltered.length) {
            e.preventDefault();
            handleSelectChatRef.current(currentFiltered[idx].chat_id);
          }
          break;
        }
        case "r": {
          if (chat && refs.replyTextarea.current) {
            e.preventDefault();
            refs.replyTextarea.current.focus();
          }
          break;
        }
        case "e": {
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_archived");
          }
          break;
        }
        case "s": {
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_vip");
          }
          break;
        }
        case "p": {
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_pinned");
          }
          break;
        }
        case "m": {
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_muted");
          }
          break;
        }
        case "/": {
          if (!chat && refs.searchInput.current) {
            e.preventDefault();
            refs.searchInput.current.focus();
          }
          break;
        }
        case "n": {
          if (chat) {
            e.preventDefault();
            const oneHour = new Date(Date.now() + 3600000).toISOString();
            handleStatusChangeRef.current(chat, "snoozed", oneHour);
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- refs are stable
}
