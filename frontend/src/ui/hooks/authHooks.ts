/**
 * Auth Hooks
 * Mounts the login page interactions.
 */

import { validateApiKey } from '@/core/api/authAPI';
import { authService } from '@/core/services/authService';

export function mountAuthHooks(onSuccess: () => void): void {
  const input  = document.getElementById('auth-input')  as HTMLInputElement;
  const submit = document.getElementById('auth-submit') as HTMLButtonElement;
  const error  = document.getElementById('auth-error')  as HTMLElement;

  const attempt = async () => {
    const key = input.value.trim();
    if (!key) return;

    submit.disabled = true;
    submit.textContent = '...';
    error.hidden = true;

    const valid = await validateApiKey(key);

    if (valid) {
      authService.set(key);
      onSuccess();
    } else {
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Se connecter';
    }
  };

  submit.addEventListener('click', attempt);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
}
