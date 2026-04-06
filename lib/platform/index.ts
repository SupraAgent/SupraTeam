/**
 * Platform detection for SupraCRM.
 *
 * Detects whether the app is running in a browser or inside the Tauri desktop shell.
 * All platform-specific behavior should branch on these helpers — never on user-agent sniffing.
 */

"use client";

/** True when running inside the Tauri desktop shell. */
export const isDesktop: boolean =
  typeof window !== "undefined" && "__TAURI__" in window;

/** True when running in a regular browser tab (not Tauri). */
export const isWeb: boolean =
  typeof window !== "undefined" && !("__TAURI__" in window);

/** True during SSR / Node.js (API routes, build). */
export const isServer: boolean = typeof window === "undefined";

/** Operating system as reported by Tauri, or "web" for browsers. */
export type Platform = "macos" | "windows" | "linux" | "web";

let _platform: Platform | null = null;

/** Resolve the current platform. Cached after first call. */
export async function getPlatform(): Promise<Platform> {
  if (_platform) return _platform;

  if (!isDesktop) {
    _platform = "web";
    return _platform;
  }

  // Tauri v2 OS plugin exposes platform() which may be sync or async depending
  // on the plugin version. Use the invoke helper to call the Rust command directly
  // which is always reliable.
  try {
    const { invoke } = await import("./tauri-invoke");
    const os = await invoke<string>("plugin:os|platform");
    if (os === "macos") _platform = "macos";
    else if (os === "windows") _platform = "windows";
    else if (os === "linux") _platform = "linux";
    else _platform = "web";
  } catch {
    _platform = "web";
  }

  return _platform;
}
