/**
 * Auth Service
 * Manages the API key (dk_xxx) in localStorage.
 * No client-side expiry — the backend is the source of truth.
 */

const STORAGE_KEY = 'htr_api_key';
const KEY_PREFIX = 'dk_';

interface StoredAuth {
  key: string;
  storedAt: number;
}

export const authService = {
  /** Get stored key. Returns null if missing or wrong format. */
  get: (): string | null => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const { key }: StoredAuth = JSON.parse(raw);
      if (!key || !key.startsWith(KEY_PREFIX)) {
        // Old static key or corrupted — clear it
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return key;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  },

  set: (key: string): void => {
    const payload: StoredAuth = { key, storedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  },

  clear: (): void => localStorage.removeItem(STORAGE_KEY),

  /** Check if a key has the correct format (dk_ prefix). */
  isValidFormat: (key: string): boolean => {
    return typeof key === 'string' && key.startsWith(KEY_PREFIX) && key.length > 10;
  },
};
