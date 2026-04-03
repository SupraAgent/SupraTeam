"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { ComposeForm } from "./compose-form";

type ComposeModalProps = {
  open: boolean;
  onClose: () => void;
  mode: "compose" | "reply" | "replyAll" | "forward";
  threadId?: string;
  messageId?: string;
  prefillTo?: string;
  prefillSubject?: string;
  onSent?: () => void;
  onSentAndArchive?: () => void;
  connectionId?: string;
};

export function ComposeModal({
  open,
  onClose,
  mode,
  threadId,
  messageId,
  prefillTo,
  prefillSubject,
  onSent,
  onSentAndArchive,
  connectionId,
}: ComposeModalProps) {
  const title =
    mode === "compose"
      ? "New Email"
      : mode === "reply"
        ? "Reply"
        : mode === "replyAll"
          ? "Reply All"
          : "Forward";

  return (
    <Modal open={open} title={title} onClose={onClose} className="max-md:max-w-none max-md:h-[100dvh] max-md:rounded-none max-md:border-0 max-md:m-0">
      <ComposeForm
        mode={mode}
        threadId={threadId}
        messageId={messageId}
        prefillTo={prefillTo}
        prefillSubject={prefillSubject}
        connectionId={connectionId}
        onSent={onSent}
        onSentAndArchive={onSentAndArchive}
        onDiscard={onClose}
        active={open}
      />
    </Modal>
  );
}
