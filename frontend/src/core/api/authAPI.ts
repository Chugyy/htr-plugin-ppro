/**
 * Auth API
 * Validates an admin API key against the backend.
 */

const BASE_URL = "http://localhost:5001";

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
