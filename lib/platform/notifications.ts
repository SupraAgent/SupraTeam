/**
 * Desktop notification helper.
 *
 * On desktop (Tauri): sends native OS notifications via the notification plugin.
 * On web: falls back to the browser Notification API (if permitted).
 *
 * Usage:
 *   import { notify } from "@/lib/platform/notifications";
 *   await notify({ title: "New message", body: "From @alice", channel: "telegram" });
 */

"use client";

import { isDesktop } from "./index";
import { invoke } from "./tauri-invoke";

interface NotifyOptions {
  title: string;
  body: string;
}

/** Send a notification using the best available method for the current platform. */
export async function notify(options: NotifyOptions): Promise<void> {
  if (isDesktop) {
    await invoke("send_notification", {
      payload: {
        title: options.title,
        body: options.body,
      },
    });
    return;
  }

  // Web fallback: browser Notification API
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    new Notification(options.title, { body: options.body });
  }
}

/** Check if notification permission is granted. */
export async function hasNotificationPermission(): Promise<boolean> {
  if (isDesktop) {
    return invoke<boolean>("check_notification_permission");
  }

  if (typeof Notification === "undefined") return false;
  return Notification.permission === "granted";
}

/** Request notification permission from the user. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isDesktop) {
    return invoke<boolean>("request_notification_permission");
  }

  if (typeof Notification === "undefined") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}
