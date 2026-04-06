/**
 * Keystore adapter interface.
 *
 * Abstracts device-bound key storage so the same crypto code works in both
 * browser (IndexedDB CryptoKey) and desktop (OS keychain via Tauri).
 */

/** Opaque handle to a stored key. Browser: CryptoKey. Desktop: raw bytes managed by OS keychain. */
export type KeyHandle = CryptoKey;

export interface KeyStore {
  /** Store a non-extractable AES-256-GCM key under the given ID. */
  setKey(id: string, key: KeyHandle): Promise<void>;

  /** Retrieve a key by ID, or null if not found. */
  getKey(id: string): Promise<KeyHandle | null>;

  /** Delete a key by ID. No-op if not found. */
  deleteKey(id: string): Promise<void>;

  /** Delete all stored keys. */
  clearAll(): Promise<void>;

  /**
   * Generate a new AES-256-GCM key and store it under the given ID.
   * Returns the key handle for immediate use.
   */
  generateKey(id: string): Promise<KeyHandle>;

  /**
   * Encrypt plaintext using the key stored under the given ID.
   * Returns "base64iv.base64ciphertext" format.
   * Throws if key not found.
   */
  encrypt(keyId: string, plaintext: string, aad?: Uint8Array): Promise<string>;

  /**
   * Decrypt a "base64iv.base64ciphertext" blob using the key stored under the given ID.
   * Throws if key not found or decryption fails.
   */
  decrypt(keyId: string, blob: string, aad?: Uint8Array): Promise<string>;
}
