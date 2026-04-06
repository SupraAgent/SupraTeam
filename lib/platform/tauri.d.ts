/**
 * Tauri global type declarations.
 *
 * When running inside Tauri's webview with `withGlobalTauri: true`,
 * the `__TAURI__` object is injected on `window`. This declaration
 * lets TypeScript understand its shape without importing @tauri-apps packages.
 */

interface Window {
  __TAURI__?: {
    core: {
      invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
    os?: {
      platform?: () => string;
    };
    [key: string]: unknown;
  };
}
