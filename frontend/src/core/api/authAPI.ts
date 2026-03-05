/**
 * Auth API
 * Validates an admin API key against the backend.
 */

export async function validateApiKey(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${import.meta.env.VITE_BACKEND_URL}/auth/validate`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(JSON.stringify({ api_key: key }));
  });
}
