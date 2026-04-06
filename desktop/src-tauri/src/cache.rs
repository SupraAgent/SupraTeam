//! SQLite cache for offline-first desktop experience.
//!
//! Stores deals, contacts, messages, email threads, API responses,
//! and pending offline actions. All data is kept in the app's data
//! directory and survives browser data clears.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{command, State};

pub struct DbState(pub Mutex<Option<Connection>>);

fn get_conn(state: &State<DbState>) -> Result<std::sync::MutexGuard<'_, Option<Connection>>, String> {
    state.0.lock().map_err(|e| e.to_string())
}

fn conn_ref(guard: &Option<Connection>) -> Result<&Connection, String> {
    guard.as_ref().ok_or_else(|| "Database not initialized".to_string())
}

/// Initialize SQLite tables. Idempotent.
#[command]
pub fn cache_init(state: State<DbState>, app: tauri::AppHandle) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;

    let db_path = app_data.join("supracrm_cache.db");
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS api_cache (
            url TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            etag TEXT
        );

        CREATE TABLE IF NOT EXISTS pending_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            url TEXT NOT NULL,
            method TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deals (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT NOT NULL,
            chat_id TEXT NOT NULL,
            text TEXT NOT NULL,
            date INTEGER NOT NULL,
            data TEXT NOT NULL,
            PRIMARY KEY (chat_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_messages_chat_date ON messages(chat_id, date DESC);

        CREATE TABLE IF NOT EXISTS email_threads (
            id TEXT NOT NULL,
            folder TEXT NOT NULL,
            subject TEXT NOT NULL,
            snippet TEXT NOT NULL,
            date INTEGER NOT NULL,
            data TEXT NOT NULL,
            PRIMARY KEY (folder, id)
        );
        CREATE INDEX IF NOT EXISTS idx_email_folder_date ON email_threads(folder, date DESC);
        ",
    )
    .map_err(|e| e.to_string())?;

    *guard = Some(conn);
    Ok(())
}

// ── API Cache ─────────────────────────────────────────────

#[derive(Serialize)]
pub struct ApiCacheRow {
    data: String,
    timestamp: i64,
    etag: Option<String>,
}

#[command]
pub fn cache_get_api(state: State<DbState>, url: String) -> Result<Option<ApiCacheRow>, String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;

    let mut stmt = conn
        .prepare("SELECT data, timestamp, etag FROM api_cache WHERE url = ?1")
        .map_err(|e| e.to_string())?;

    let row = stmt
        .query_row(params![url], |row| {
            Ok(ApiCacheRow {
                data: row.get(0)?,
                timestamp: row.get(1)?,
                etag: row.get(2)?,
            })
        })
        .ok();

    Ok(row)
}

#[command]
pub fn cache_set_api(
    state: State<DbState>,
    url: String,
    data: String,
    timestamp: i64,
    etag: Option<String>,
) -> Result<(), String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    conn.execute(
        "INSERT OR REPLACE INTO api_cache (url, data, timestamp, etag) VALUES (?1, ?2, ?3, ?4)",
        params![url, data, timestamp, etag],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Pending Actions ───────────────────────────────────────

#[derive(Serialize)]
pub struct PendingActionRow {
    id: i64,
    action_type: String,
    url: String,
    method: String,
    body: String,
    created_at: i64,
}

#[command]
pub fn cache_add_pending_action(
    state: State<DbState>,
    action_type: String,
    url: String,
    method: String,
    body: String,
    created_at: i64,
) -> Result<i64, String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    conn.execute(
        "INSERT INTO pending_actions (action_type, url, method, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![action_type, url, method, body, created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[command]
pub fn cache_get_pending_actions(state: State<DbState>) -> Result<Vec<PendingActionRow>, String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let mut stmt = conn
        .prepare("SELECT id, action_type, url, method, body, created_at FROM pending_actions ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(PendingActionRow {
                id: row.get(0)?,
                action_type: row.get(1)?,
                url: row.get(2)?,
                method: row.get(3)?,
                body: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[command]
pub fn cache_remove_pending_action(state: State<DbState>, id: i64) -> Result<(), String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    conn.execute("DELETE FROM pending_actions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn cache_get_pending_action_count(state: State<DbState>) -> Result<i64, String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM pending_actions", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

// ── Deals ─────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DataRow {
    data: String,
}

#[derive(Deserialize)]
pub struct DealInput {
    id: String,
    data: String,
}

#[command]
pub fn cache_store_deal(state: State<DbState>, id: String, data: String) -> Result<(), String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    conn.execute(
        "INSERT OR REPLACE INTO deals (id, data) VALUES (?1, ?2)",
        params![id, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn cache_store_deals(state: State<DbState>, deals: Vec<DealInput>) -> Result<(), String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for deal in deals {
        tx.execute(
            "INSERT OR REPLACE INTO deals (id, data) VALUES (?1, ?2)",
            params![deal.id, deal.data],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn cache_get_deal(state: State<DbState>, id: String) -> Result<Option<String>, String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let data: Option<String> = conn
        .query_row("SELECT data FROM deals WHERE id = ?1", params![id], |row| {
            row.get(0)
        })
        .ok();
    Ok(data)
}

#[command]
pub fn cache_get_all_deals(state: State<DbState>) -> Result<Vec<DataRow>, String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let mut stmt = conn
        .prepare("SELECT data FROM deals")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(DataRow { data: row.get(0)? }))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ── Contacts ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ContactInput {
    id: String,
    data: String,
}

#[command]
pub fn cache_store_contact(state: State<DbState>, id: String, data: String) -> Result<(), String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    conn.execute(
        "INSERT OR REPLACE INTO contacts (id, data) VALUES (?1, ?2)",
        params![id, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn cache_store_contacts(
    state: State<DbState>,
    contacts: Vec<ContactInput>,
) -> Result<(), String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for contact in contacts {
        tx.execute(
            "INSERT OR REPLACE INTO contacts (id, data) VALUES (?1, ?2)",
            params![contact.id, contact.data],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn cache_get_all_contacts(state: State<DbState>) -> Result<Vec<DataRow>, String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let mut stmt = conn
        .prepare("SELECT data FROM contacts")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(DataRow { data: row.get(0)? }))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ── Messages ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct MessageInput {
    id: String,
    #[serde(rename = "chatId")]
    chat_id: String,
    text: String,
    date: i64,
    data: String,
}

#[command]
pub fn cache_store_messages(
    state: State<DbState>,
    chat_id: String,
    messages: Vec<MessageInput>,
) -> Result<(), String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for msg in messages {
        tx.execute(
            "INSERT OR REPLACE INTO messages (id, chat_id, text, date, data) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![msg.id, chat_id, msg.text, msg.date, msg.data],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn cache_get_messages(
    state: State<DbState>,
    chat_id: String,
    limit: i64,
) -> Result<Vec<DataRow>, String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let mut stmt = conn
        .prepare("SELECT data FROM messages WHERE chat_id = ?1 ORDER BY date DESC LIMIT ?2")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![chat_id, limit], |row| {
            Ok(DataRow { data: row.get(0)? })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ── Email Threads ─────────────────────────────────────────

#[derive(Deserialize)]
pub struct EmailThreadInput {
    id: String,
    folder: String,
    subject: String,
    snippet: String,
    date: i64,
    data: String,
}

#[command]
pub fn cache_store_email_threads(
    state: State<DbState>,
    folder: String,
    threads: Vec<EmailThreadInput>,
) -> Result<(), String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for thread in threads {
        tx.execute(
            "INSERT OR REPLACE INTO email_threads (id, folder, subject, snippet, date, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![thread.id, folder, thread.subject, thread.snippet, thread.date, thread.data],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn cache_get_email_threads(
    state: State<DbState>,
    folder: String,
    limit: i64,
) -> Result<Vec<DataRow>, String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    let mut stmt = conn
        .prepare("SELECT data FROM email_threads WHERE folder = ?1 ORDER BY date DESC LIMIT ?2")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![folder, limit], |row| {
            Ok(DataRow { data: row.get(0)? })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ── Maintenance ───────────────────────────────────────────

#[command]
pub fn cache_clear_all(state: State<DbState>) -> Result<(), String> {
    let guard = get_conn(&state)?;
    let conn = conn_ref(&guard)?;
    conn.execute_batch(
        "
        DELETE FROM api_cache;
        DELETE FROM pending_actions;
        DELETE FROM deals;
        DELETE FROM contacts;
        DELETE FROM messages;
        DELETE FROM email_threads;
        ",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
