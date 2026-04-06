"use client";

import * as React from "react";
import type { Conversation } from "./inbox-types";

// ── Hook Input ─────────────────────────────────────────────────

export interface InboxKeyboardInput {
  selectedChat: number | null;
  currentUserId: string | null;
  conversations: Conversation[];
  filtered: Conversation[];
  highlightedIndex: number;
  setHighlightedIndex: React.Dispatch<React.SetStateAction<number>>;
  setSelectedChat: React.Dispatch<React.SetStateAction<number | null>>;
  setShowShortcutHelp: React.Dispatch<React.SetStateAction<boolean>>;
  setShowScheduleMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCanned: React.Dispatch<React.SetStateAction<boolean>>;
  setAiSummary: React.Dispatch<React.SetStateAction<string | null>>;
  handleAssign: (chatId: number, userId: string | null) => void;
  handleStatusChange: (chatId: number, status: string, snoozedUntil?: string) => void;
  toggleLabel: (chatId: number, groupName: string, field: "is_vip" | "is_archived" | "is_pinned" | "is_muted") => void;
  handleSelectChat: (chatId: number) => void;
  showShortcutHelp: boolean;
  showScheduleMenu: boolean;
  showCanned: boolean;
  aiSummary: string | null;
  replyTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

// ── Hook ───────────────────────────────────────────────────────

export function useInboxKeyboard({
  selectedChat,
  currentUserId,
  conversations,
  filtered,
  highlightedIndex,
  setHighlightedIndex,
  setSelectedChat,
  setShowShortcutHelp,
  setShowScheduleMenu,
  setShowCanned,
  setAiSummary,
  handleAssign,
  handleStatusChange,
  toggleLabel,
  handleSelectChat,
  showShortcutHelp,
  showScheduleMenu,
  showCanned,
  aiSummary,
  replyTextareaRef,
  searchInputRef,
}: InboxKeyboardInput): void {
  // Refs for keyboard handler to avoid stale closures
  const selectedChatRef = React.useRef(selectedChat);
  selectedChatRef.current = selectedChat;
  const currentUserIdRef = React.useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const conversationsRef = React.useRef(conversations);
  conversationsRef.current = conversations;
  const filteredRef = React.useRef(filtered);
  filteredRef.current = filtered;
  const highlightedIndexRef = React.useRef(highlightedIndex);
  highlightedIndexRef.current = highlightedIndex;
  const handleAssignRef = React.useRef(handleAssign);
  handleAssignRef.current = handleAssign;
  const handleStatusChangeRef = React.useRef(handleStatusChange);
  handleStatusChangeRef.current = handleStatusChange;
  const toggleLabelRef = React.useRef(toggleLabel);
  toggleLabelRef.current = toggleLabel;
  const handleSelectChatRef = React.useRef(handleSelectChat);
  handleSelectChatRef.current = handleSelectChat;
  const showShortcutHelpRef = React.useRef(showShortcutHelp);
  showShortcutHelpRef.current = showShortcutHelp;
  const showScheduleMenuRef = React.useRef(showScheduleMenu);
  showScheduleMenuRef.current = showScheduleMenu;
  const showCannedRef = React.useRef(showCanned);
  showCannedRef.current = showCanned;
  const aiSummaryRef = React.useRef(aiSummary);
  aiSummaryRef.current = aiSummary;

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      // ? always toggles help
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        if (isInput && target.tagName !== "INPUT") return;
        // Allow ? in textareas but not plain typing
        if (target.tagName === "INPUT") return;
        e.preventDefault();
        setShowShortcutHelp((p) => !p);
        return;
      }

      // Escape works everywhere
      if (e.key === "Escape") {
        if (showShortcutHelpRef.current) { setShowShortcutHelp(false); return; }
        if (showScheduleMenuRef.current) { setShowScheduleMenu(false); return; }
        if (showCannedRef.current) { setShowCanned(false); return; }
        if (aiSummaryRef.current) { setAiSummary(null); return; }
        if (selectedChatRef.current) { setSelectedChat(null); return; }
        return;
      }

      // Skip shortcuts when typing in input/textarea
      if (isInput) return;

      const chat = selectedChatRef.current;
      const userId = currentUserIdRef.current;
      const currentFiltered = filteredRef.current;
      const selectedConv = chat
        ? conversationsRef.current.find((c) => c.chat_id === chat)
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
          // Next conversation
          e.preventDefault();
          setHighlightedIndex((prev) => Math.min(prev + 1, currentFiltered.length - 1));
          break;
        }
        case "k": {
          // Previous conversation
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "Enter": {
          // Open highlighted conversation
          const idx = highlightedIndexRef.current;
          if (idx >= 0 && idx < currentFiltered.length) {
            e.preventDefault();
            handleSelectChatRef.current(currentFiltered[idx].chat_id);
          }
          break;
        }
        case "r": {
          // Focus reply textarea
          if (chat && replyTextareaRef.current) {
            e.preventDefault();
            replyTextareaRef.current.focus();
          }
          break;
        }
        case "e": {
          // Archive
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_archived");
          }
          break;
        }
        case "s": {
          // Toggle VIP/star
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_vip");
          }
          break;
        }
        case "p": {
          // Toggle pin
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_pinned");
          }
          break;
        }
        case "m": {
          // Toggle mute
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_muted");
          }
          break;
        }
        case "/": {
          // Focus search when no conversation open
          if (!chat && searchInputRef.current) {
            e.preventDefault();
            searchInputRef.current.focus();
          }
          break;
        }
        case "n": {
          // Snooze / mark unread
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
