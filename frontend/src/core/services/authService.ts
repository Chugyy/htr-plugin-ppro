/**
 * Auth Service
 * Manages the admin API key in localStorage.
 *
 * EXPIRATION — current approach (frontend-side):
 *   The key is stored alongside a `storedAt` timestamp. On every `get()`,
 *   the age is checked locally: if > 30 days, the key is cleared and the
 *   user is forced to re-authenticate. The backend key itself can remain
 *   unchanged — expiry is enforced purely client-side.
 *
 * EXPIRATION — future approach (backend-side dynamic keys):
 *   When dynamic key generation is needed, the backend should:
 *     1. Generate a signed token embedding an expiry (e.g. HMAC or JWT):
 *        `token = sign({ issued_at, expires_at }, SECRET)`
 *     2. Expose a `POST /auth/token` endpoint that issues a fresh token.
 *     3. In `POST /auth/validate`, verify the signature AND `expires_at`.
 *   The frontend `storedAt` check becomes a quick local pre-check (UX only),
 *   while the backend is the single source of truth for expiry enforcement.
 */

const STORAGE_KEY = 'htr_api_key';
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredAuth {
  key: string;
  storedAt: number;
}

export const authService = {
  get: (): string | null => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { key, storedAt }: StoredAuth = JSON.parse(raw);
    if (Date.now() - storedAt > EXPIRY_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return key;
  },
  set: (key: string): void => {
    const payload: StoredAuth = { key, storedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  },
  clear: (): void => localStorage.removeItem(STORAGE_KEY),
};
