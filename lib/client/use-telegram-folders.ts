import * as React from "react";
import { toast } from "sonner";

export interface ChatFolder {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  is_collapsed: boolean;
  position: number;
  members: { telegram_chat_id: number; chat_title: string | null }[];
}

export function useTelegramFolders() {
  const [folders, setFolders] = React.useState<ChatFolder[]>([]);
  const [activeFolder, setActiveFolder] = React.useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");

  // Fetch folders on mount
  React.useEffect(() => {
    fetch("/api/telegram/groups")
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((d) => {
        if (d.data) setFolders(d.data);
      })
      .catch(() => {});
  }, []);

  const createFolder = React.useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      await fetch("/api/telegram/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      const res = await fetch("/api/telegram/groups");
      const d = await res.json();
      if (d.data) setFolders(d.data);
      setNewFolderName("");
      setShowNewFolder(false);
    } catch (err) {
      toast.error("Failed to create folder", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }, [newFolderName]);

  const addDialogToFolder = React.useCallback(
    async (folderId: string, chatId: number, chatTitle: string) => {
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;
      if (folder.members.some((m) => m.telegram_chat_id === chatId)) {
        toast("Chat is already in this folder");
        return;
      }
      // Optimistic update
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId
            ? {
                ...f,
                members: [
                  ...f.members,
                  { telegram_chat_id: chatId, chat_title: chatTitle },
                ],
              }
            : f
        )
      );
      try {
        const res = await fetch("/api/telegram/groups/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            group_id: folderId,
            chat_ids: [chatId],
            chat_titles: { [chatId]: chatTitle },
          }),
        });
        if (!res.ok) {
          const json = await res.json();
          toast.error(json.error || "Failed to add to folder");
          setFolders((prev) =>
            prev.map((f) =>
              f.id === folderId
                ? {
                    ...f,
                    members: f.members.filter(
                      (m) => m.telegram_chat_id !== chatId
                    ),
                  }
                : f
            )
          );
        } else {
          toast.success(`Added to "${folder.name}"`);
        }
      } catch {
        toast.error("Failed to add to folder");
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folderId
              ? {
                  ...f,
                  members: f.members.filter(
                    (m) => m.telegram_chat_id !== chatId
                  ),
                }
              : f
          )
        );
      }
    },
    [folders]
  );

  return {
    folders,
    activeFolder,
    setActiveFolder,
    showNewFolder,
    setShowNewFolder,
    newFolderName,
    setNewFolderName,
    createFolder,
    addDialogToFolder,
  };
}
