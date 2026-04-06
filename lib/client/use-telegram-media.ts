import * as React from "react";
import { toast } from "sonner";
import type { TelegramBrowserService, TgMessage, TgDialog } from "@/lib/client/telegram-service";

type PeerType = "user" | "chat" | "channel";

export function useTelegramMedia(
  service: TelegramBrowserService,
  activeDialog: TgDialog | null,
  peerType: PeerType | null
) {
  // Media preview
  const [mediaPreview, setMediaPreview] = React.useState<{
    url: string;
    type: string;
  } | null>(null);
  const [mediaLoading, setMediaLoading] = React.useState<number | null>(null);
  const mediaBlobUrlRef = React.useRef<string | null>(null);

  // Voice playback
  const [playingVoice, setPlayingVoice] = React.useState<number | null>(null);
  const playingVoiceRef = React.useRef<number | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const voiceBlobRef = React.useRef<string | null>(null);

  // File upload
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [pendingFilePreview, setPendingFilePreview] = React.useState<
    string | null
  >(null);
  const pendingFilePreviewRef = React.useRef<string | null>(null);
  const [fileCaption, setFileCaption] = React.useState("");

  // Keep ref in sync for stable cleanup callback
  React.useEffect(() => {
    pendingFilePreviewRef.current = pendingFilePreview;
  }, [pendingFilePreview]);

  // Clean up blob URLs on unmount
  React.useEffect(() => {
    return () => {
      if (mediaBlobUrlRef.current) URL.revokeObjectURL(mediaBlobUrlRef.current);
      if (voiceBlobRef.current) URL.revokeObjectURL(voiceBlobRef.current);
      if (pendingFilePreviewRef.current) URL.revokeObjectURL(pendingFilePreviewRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const handleMediaDownload = React.useCallback(
    async (msg: TgMessage) => {
      if (!activeDialog || !peerType || !msg.mediaType) return;
      // Stop any active voice playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (voiceBlobRef.current) {
        URL.revokeObjectURL(voiceBlobRef.current);
        voiceBlobRef.current = null;
      }
      setPlayingVoice(null);
      setMediaLoading(msg.id);
      try {
        const url = await service.downloadMedia(
          peerType,
          activeDialog.telegramId,
          activeDialog.accessHash,
          msg.id
        );
        if (url) {
          if (mediaBlobUrlRef.current)
            URL.revokeObjectURL(mediaBlobUrlRef.current);
          mediaBlobUrlRef.current = url;
          setMediaPreview({ url, type: msg.mediaType });
        } else {
          toast.error("Media not available");
        }
      } catch (err) {
        toast.error("Failed to download media", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setMediaLoading(null);
      }
    },
    [activeDialog, peerType, service]
  );

  // Keep ref in sync so handleVoicePlay doesn't need playingVoice in deps
  React.useEffect(() => {
    playingVoiceRef.current = playingVoice;
  }, [playingVoice]);

  const handleVoicePlay = React.useCallback(
    async (msg: TgMessage) => {
      if (!activeDialog || !peerType) return;
      if (playingVoiceRef.current === msg.id && audioRef.current) {
        audioRef.current.pause();
        setPlayingVoice(null);
        return;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (voiceBlobRef.current) {
        URL.revokeObjectURL(voiceBlobRef.current);
        voiceBlobRef.current = null;
      }
      setMediaLoading(msg.id);
      try {
        const url = await service.downloadMedia(
          peerType,
          activeDialog.telegramId,
          activeDialog.accessHash,
          msg.id
        );
        if (!url) {
          toast.error("Voice message not available");
          return;
        }
        voiceBlobRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        setPlayingVoice(msg.id);
        audio.onended = () => setPlayingVoice(null);
        audio.onerror = () => {
          setPlayingVoice(null);
          toast.error("Failed to play voice message");
        };
        await audio.play();
      } catch (err) {
        toast.error("Failed to play voice message", {
          description: err instanceof Error ? err.message : undefined,
        });
        setPlayingVoice(null);
      } finally {
        setMediaLoading(null);
      }
    },
    [activeDialog, peerType, service]
  );

  const handleFileSelect = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeDialog) return;
      if (file.size > 50 * 1024 * 1024) {
        toast.error("File too large", {
          description: "Maximum file size is 50 MB",
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setPendingFile(file);
      setFileCaption("");
      if (file.type.startsWith("image/")) {
        setPendingFilePreview(URL.createObjectURL(file));
      } else {
        setPendingFilePreview(null);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [activeDialog]
  );

  const handleFileSend = React.useCallback(async () => {
    if (!pendingFile || !activeDialog || !peerType) return;
    setUploadingFile(true);
    try {
      await service.sendFileSimple(
        peerType,
        activeDialog.telegramId,
        activeDialog.accessHash,
        pendingFile,
        fileCaption.trim() || undefined
      );
    } catch (err) {
      toast.error("Failed to upload file", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploadingFile(false);
      if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview);
      setPendingFile(null);
      setPendingFilePreview(null);
      setFileCaption("");
    }
  }, [
    pendingFile,
    activeDialog,
    peerType,
    service,
    fileCaption,
    pendingFilePreview,
  ]);

  const cancelFileUpload = React.useCallback(() => {
    if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview);
    setPendingFile(null);
    setPendingFilePreview(null);
    setFileCaption("");
  }, [pendingFilePreview]);

  const closeMediaPreview = React.useCallback(() => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview.url);
    setMediaPreview(null);
  }, [mediaPreview]);

  // Clean up all media state when switching dialogs
  const cleanupOnDialogSwitch = React.useCallback(() => {
    // Media preview
    if (mediaBlobUrlRef.current) {
      URL.revokeObjectURL(mediaBlobUrlRef.current);
      mediaBlobUrlRef.current = null;
    }
    setMediaPreview(null);
    // Pending file upload
    if (pendingFilePreviewRef.current) {
      URL.revokeObjectURL(pendingFilePreviewRef.current);
      pendingFilePreviewRef.current = null;
    }
    setPendingFile(null);
    setPendingFilePreview(null);
    setFileCaption("");
    // Voice playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (voiceBlobRef.current) {
      URL.revokeObjectURL(voiceBlobRef.current);
      voiceBlobRef.current = null;
    }
    setPlayingVoice(null);
  }, []);

  return {
    mediaPreview,
    mediaLoading,
    playingVoice,
    fileInputRef,
    uploadingFile,
    pendingFile,
    pendingFilePreview,
    fileCaption,
    setFileCaption,
    handleMediaDownload,
    handleVoicePlay,
    handleFileSelect,
    handleFileSend,
    cancelFileUpload,
    closeMediaPreview,
    cleanupOnDialogSwitch,
  };
}
