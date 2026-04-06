import * as React from "react";
import { toast } from "sonner";
import type { TelegramBrowserService, TgUserProfile, TgChatProfile, TgDialog } from "@/lib/client/telegram-service";

export function useTelegramProfile(
  service: TelegramBrowserService,
  status: string,
  activeDialog: TgDialog | null
) {
  const [showProfile, setShowProfile] = React.useState(false);
  const [profileData, setProfileData] = React.useState<
    TgUserProfile | TgChatProfile | null
  >(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [onlineStatus, setOnlineStatus] = React.useState<string | null>(null);
  const profilePhotoUrlRef = React.useRef<string | null>(null);

  // Fetch online status for private chats
  React.useEffect(() => {
    setOnlineStatus(null);
    if (
      !activeDialog ||
      status !== "connected" ||
      activeDialog.type !== "private"
    )
      return;
    service
      .getUserProfile(activeDialog.telegramId, activeDialog.accessHash)
      .then((profile) => setOnlineStatus(profile.status))
      .catch(() => {});
  }, [
    activeDialog?.id,
    activeDialog?.telegramId,
    activeDialog?.accessHash,
    activeDialog?.type,
    status,
    service,
  ]);

  // Clean up profile photo on dialog switch
  React.useEffect(() => {
    setShowProfile(false);
    setProfileData(null);
    if (profilePhotoUrlRef.current) {
      URL.revokeObjectURL(profilePhotoUrlRef.current);
      profilePhotoUrlRef.current = null;
    }
  }, [activeDialog?.id]);

  // Clean up on unmount
  React.useEffect(() => {
    return () => {
      if (profilePhotoUrlRef.current)
        URL.revokeObjectURL(profilePhotoUrlRef.current);
    };
  }, []);

  const openProfile = React.useCallback(async () => {
    if (!activeDialog || status !== "connected") return;
    setShowProfile(true);
    setProfileLoading(true);
    try {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }

      if (activeDialog.type === "private") {
        const profile = await service.getUserProfile(
          activeDialog.telegramId,
          activeDialog.accessHash
        );
        if (profile.photoUrl) profilePhotoUrlRef.current = profile.photoUrl;
        setProfileData(profile);
      } else {
        const pt =
          activeDialog.type === "group"
            ? ("chat" as const)
            : ("channel" as const);
        const profile = await service.getChatProfile(
          pt,
          activeDialog.telegramId,
          activeDialog.accessHash
        );
        if (profile.photoUrl) profilePhotoUrlRef.current = profile.photoUrl;
        setProfileData(profile);
      }
    } catch (err) {
      toast.error("Failed to load profile", {
        description: err instanceof Error ? err.message : undefined,
      });
      setShowProfile(false);
    } finally {
      setProfileLoading(false);
    }
  }, [activeDialog, status, service]);

  return {
    showProfile,
    setShowProfile,
    profileData,
    profileLoading,
    onlineStatus,
    openProfile,
  };
}
