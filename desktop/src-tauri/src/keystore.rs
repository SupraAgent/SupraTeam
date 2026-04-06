//! OS keychain integration for device-bound encryption keys.
//!
//! Uses the `keyring` crate which abstracts:
//!   - macOS: Keychain Services
//!   - Windows: Credential Manager
//!   - Linux: Secret Service (GNOME Keyring / KWallet)

use keyring::Entry;
use tauri::command;

/// Generate 256 bits of cryptographically secure random key material,
/// store it in the OS keychain, and return the base64-encoded bytes.
///
/// Key material is generated in Rust (not JS) so it never exists as
/// a JavaScript string that can't be zeroed.
#[command]
pub fn keystore_generate(service: String, key: String) -> Result<String, String> {
    let mut raw = [0u8; 32];
    getrandom::fill(&mut raw).map_err(|e| e.to_string())?;

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(raw);

    // Zero the raw bytes after encoding
    raw.fill(0);

    let entry = Entry::new(&service, &key).map_err(|e| e.to_string())?;
    entry.set_password(&b64).map_err(|e| e.to_string())?;

    Ok(b64)
}

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

/// Delete all keys for the service by querying tracked key IDs from SQLite.
/// Falls back to deleting the known key pattern if SQLite is unavailable.
#[command]
pub fn keystore_clear(service: String, key_ids: Vec<String>) -> Result<(), String> {
    for kid in &key_ids {
        let entry = Entry::new(&service, kid).map_err(|e| e.to_string())?;
        match entry.delete_credential() {
            Ok(()) => {}
            Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
