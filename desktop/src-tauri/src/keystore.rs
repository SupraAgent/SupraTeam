//! OS keychain integration for device-bound encryption keys.
//!
//! Uses the `keyring` crate which abstracts:
//!   - macOS: Keychain Services
//!   - Windows: Credential Manager
//!   - Linux: Secret Service (GNOME Keyring / KWallet)

use keyring::Entry;
use tauri::command;

/// Store a base64-encoded key in the OS keychain.
#[command]
pub fn keystore_set(service: String, key: String, value: String) -> Result<(), String> {
    let entry = Entry::new(&service, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

/// Retrieve a base64-encoded key from the OS keychain. Returns null if not found.
#[command]
pub fn keystore_get(service: String, key: String) -> Result<Option<String>, String> {
    let entry = Entry::new(&service, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Delete a key from the OS keychain. No-op if not found.
#[command]
pub fn keystore_delete(service: String, key: String) -> Result<(), String> {
    let entry = Entry::new(&service, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Clear all keys for the service. Deletes known key patterns.
/// Note: OS keychains don't support wildcard deletion, so this deletes
/// keys with the "supracrm" service prefix that we track.
#[command]
pub fn keystore_clear(service: String) -> Result<(), String> {
    // The keyring crate doesn't support listing entries.
    // In practice, we track key IDs in SQLite and delete them individually.
    // For now, this is a best-effort clear of the known key pattern.
    let _ = keystore_delete(service.clone(), "tg-session-key".to_string());
    Ok(())
}
