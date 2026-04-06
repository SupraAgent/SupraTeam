/**
 * Shared Tauri IPC invoke helper.
 *
 * Calls commands via the global __TAURI__ object injected by Tauri's webview.
 * Avoids importing @tauri-apps/api which breaks Next.js bundling in web mode.
 */

"use client";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) {
    throw new Error("Tauri runtime not available");
  }
  return tauri.core.invoke(cmd, args) as Promise<T>;
}
