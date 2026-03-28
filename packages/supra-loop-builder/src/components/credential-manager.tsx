"use client";

import * as React from "react";
import {
  listCredentials,
  addCredential,
  deleteCredential,
  updateCredential,
  setCredentialStoragePrefix,
} from "../lib/credential-store";

type CredentialManagerProps = {
  onClose: () => void;
  storageKeyPrefix?: string;
};

type CredentialEntry = {
  id: string;
  name: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
};

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)", icon: "🧠" },
  { value: "openai", label: "OpenAI", icon: "🤖" },
  { value: "custom-api", label: "Custom API", icon: "🔑" },
  { value: "webhook-secret", label: "Webhook Secret", icon: "🔒" },
  { value: "database", label: "Database", icon: "💾" },
  { value: "github", label: "GitHub Token", icon: "🐙" },
];

export function CredentialManager({ onClose, storageKeyPrefix }: CredentialManagerProps) {
  const [credentials, setCredentials] = React.useState<CredentialEntry[]>([]);
  const [showAdd, setShowAdd] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  // Add form state
  const [newName, setNewName] = React.useState("");
  const [newProvider, setNewProvider] = React.useState("anthropic");
  const [newValue, setNewValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (storageKeyPrefix) {
      setCredentialStoragePrefix(storageKeyPrefix);
    }
    setCredentials(listCredentials());
  }, [storageKeyPrefix]);

  async function handleAdd() {
    if (!newName.trim() || !newValue.trim()) {
      setError("Name and value are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addCredential(newName.trim(), newProvider, newValue);
      setCredentials(listCredentials());
      setNewName("");
      setNewProvider("anthropic");
      setNewValue("");
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credential");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!newValue.trim()) {
      setError("Value is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateCredential(id, newValue);
      setCredentials(listCredentials());
      setEditId(null);
      setNewValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update credential");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    deleteCredential(id);
    setCredentials(listCredentials());
    setConfirmDeleteId(null);
  }

  const inputClass = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[460px] max-h-[80vh] overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Credential Store</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Encrypted with AES-256-GCM</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Credentials list */}
        <div className="p-4 space-y-2">
          {credentials.length === 0 && !showAdd && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🔐</div>
              <p className="text-sm text-muted-foreground">No credentials stored yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Add API keys and secrets to use in your workflow nodes.
              </p>
            </div>
          )}

          {credentials.map((cred) => {
            const providerInfo = PROVIDERS.find((p) => p.value === cred.provider);
            const isEditing = editId === cred.id;

            return (
              <div
                key={cred.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{providerInfo?.icon ?? "🔑"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{cred.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {providerInfo?.label ?? cred.provider} · Updated {new Date(cred.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditId(isEditing ? null : cred.id);
                        setNewValue("");
                        setConfirmDeleteId(null);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition text-xs"
                      title="Update value"
                    >
                      {isEditing ? "Cancel" : "Edit"}
                    </button>
                    <button
                      onClick={() => handleDelete(cred.id)}
                      className={`rounded-md p-1.5 text-xs transition ${
                        confirmDeleteId === cred.id
                          ? "bg-red-500/20 text-red-400"
                          : "text-muted-foreground hover:bg-white/10 hover:text-red-400"
                      }`}
                    >
                      {confirmDeleteId === cred.id ? "Confirm?" : "Delete"}
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-3 space-y-2">
                    <input
                      type="password"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Enter new value..."
                      className={inputClass}
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdate(cred.id)}
                      disabled={saving}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Update"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add credential form */}
          {showAdd && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-foreground">Add Credential</h3>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (e.g., My API Key)"
                className={inputClass}
                autoFocus
              />
              <select
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value)}
                className={`${inputClass} [&>option]:bg-neutral-900`}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.icon} {p.label}
                  </option>
                ))}
              </select>
              <input
                type="password"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="Secret value (encrypted at rest)"
                className={inputClass}
              />
              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowAdd(false); setError(null); }}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
                >
                  {saving ? "Encrypting..." : "Add Credential"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/50">
            {credentials.length} credential{credentials.length !== 1 ? "s" : ""} stored
          </span>
          {!showAdd && (
            <button
              onClick={() => { setShowAdd(true); setEditId(null); setConfirmDeleteId(null); }}
              className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition"
            >
              + Add Credential
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
