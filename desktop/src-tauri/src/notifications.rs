//! Native OS notifications for desktop.
//!
//! Sends system notifications for Telegram messages, emails, deal updates, etc.
//! Uses Tauri's notification plugin for cross-platform support.

use serde::Deserialize;
use tauri::command;
use tauri_plugin_notification::NotificationExt;

#[derive(Deserialize)]
pub struct NotificationPayload {
    pub title: String,
    pub body: String,
}

/// Send a native OS notification.
#[command]
pub fn send_notification(
    app: tauri::AppHandle,
    payload: NotificationPayload,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&payload.title)
        .body(&payload.body)
        .show()
        .map_err(|e| e.to_string())
}

/// Check if notification permission is granted.
#[command]
pub fn check_notification_permission(app: tauri::AppHandle) -> Result<bool, String> {
    let perm = app
        .notification()
        .permission_state()
        .map_err(|e| e.to_string())?;
    Ok(perm == tauri_plugin_notification::PermissionState::Granted)
}

/// Request notification permission from the OS.
#[command]
pub fn request_notification_permission(app: tauri::AppHandle) -> Result<bool, String> {
    let perm = app
        .notification()
        .request_permission()
        .map_err(|e| e.to_string())?;
    Ok(perm == tauri_plugin_notification::PermissionState::Granted)
}
