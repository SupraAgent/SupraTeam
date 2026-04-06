mod cache;
mod keystore;
mod notifications;

use cache::DbState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DbState(Mutex::new(None)))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            // Keystore
            keystore::keystore_set,
            keystore::keystore_get,
            keystore::keystore_delete,
            keystore::keystore_clear,
            // Cache
            cache::cache_init,
            cache::cache_get_api,
            cache::cache_set_api,
            cache::cache_add_pending_action,
            cache::cache_get_pending_actions,
            cache::cache_remove_pending_action,
            cache::cache_get_pending_action_count,
            cache::cache_store_deal,
            cache::cache_store_deals,
            cache::cache_get_deal,
            cache::cache_get_all_deals,
            cache::cache_store_contact,
            cache::cache_store_contacts,
            cache::cache_get_all_contacts,
            cache::cache_store_messages,
            cache::cache_get_messages,
            cache::cache_store_email_threads,
            cache::cache_get_email_threads,
            cache::cache_clear_all,
            // Notifications
            notifications::send_notification,
            notifications::check_notification_permission,
            notifications::request_notification_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
