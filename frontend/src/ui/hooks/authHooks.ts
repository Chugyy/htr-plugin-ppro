/**
 * Auth Hooks
 * Mounts the login page interactions.
 */

import { validateApiKey } from '@/core/api/authAPI';
import { authService } from '@/core/services/authService';
import { createInput } from '@/ui/components';

export function mountAuthHooks(onSuccess: () => void): void {
  const container = document.getElementById('auth-input-container');
  const submit = document.getElementById('auth-submit') as HTMLElement;
  const error  = document.getElementById('auth-error')  as HTMLElement;

  // Build password input via JS (wrapper approach)
  const inputWrapper = createInput({ type: 'text', placeholder: 'Colle ta clé ici' });
  inputWrapper.style.width = '100%';
  inputWrapper.style.maxWidth = '220px';
  container?.appendChild(inputWrapper);
  const input = inputWrapper.querySelector('input')!;

  const attempt = async () => {
    const key = input.value.trim();
    if (!key) return;

    submit.classList.add('btn--disabled');
    submit.textContent = '...';
    error.hidden = true;

    const valid = await validateApiKey(key);

    if (valid) {
      authService.set(key);
      onSuccess();
    } else {
      error.hidden = false;
      submit.classList.remove('btn--disabled');
      submit.textContent = 'Se connecter';
    }
  };

  submit.addEventListener('click', attempt);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
}
