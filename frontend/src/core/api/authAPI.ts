/**
 * Auth API
 * Validates an API key (dk_xxx) against the backend.
 */

export async function validateApiKey(key: string): Promise<boolean> {
  // Quick format check before hitting the network
  if (!key || !key.startsWith('dk_') || key.length < 10) {
    return false;
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${import.meta.env.VITE_BACKEND_URL}/api/auth/validate-key`);
    xhr.setRequestHeader('X-API-Key', key);
    xhr.timeout = 8000;
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.ontimeout = () => resolve(false);
    xhr.send();
  });
}
