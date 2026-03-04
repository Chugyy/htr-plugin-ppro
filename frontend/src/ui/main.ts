import './styles/main.css';
import { validateApiKey } from '@/core/api/authAPI';
import { authService } from '@/core/services/authService';
import { mountAuthHooks } from './hooks/authHooks';
import { mountGenerationHooks } from './hooks/generationHooks';
import { mountCorrectionHooks } from './hooks/correctionHooks';
import { mountAudioHooks } from './hooks/audioHooks';

async function loadPages(): Promise<void> {
  const pages: Array<{ id: string; path: string }> = [
    { id: 'tab-generation', path: './pages/generation.html' },
    { id: 'tab-correction', path: './pages/correction.html' },
    { id: 'tab-audio',      path: './pages/audio.html' },
  ];

  await Promise.all(
    pages.map(async ({ id, path }) => {
      const res = await fetch(path);
      const html = await res.text();
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    })
  );
}

function initTabNavigation(): void {
  const buttons = document.querySelectorAll<HTMLElement>('.tab__btn');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-tab');
      if (!tab) return;
      buttons.forEach(b => b.classList.remove('tab__btn--active'));
      button.classList.add('tab__btn--active');
      document.querySelectorAll('.tab__panel').forEach(p => p.classList.remove('tab__panel--active'));
      document.getElementById(`tab-${tab}`)?.classList.add('tab__panel--active');
    });
  });
}

async function showAuthPage(): Promise<void> {
  const res = await fetch('./pages/auth.html');
  const html = await res.text();
  document.getElementById('app')!.innerHTML = html;
  mountAuthHooks(() => window.location.reload());
}

async function initApp(): Promise<void> {
  await loadPages();
  initTabNavigation();
  mountGenerationHooks();
  mountCorrectionHooks();
  mountAudioHooks();
}

document.addEventListener('DOMContentLoaded', async () => {
  const storedKey = authService.get();
  const isAuthed  = storedKey ? await validateApiKey(storedKey) : false;

  if (!isAuthed) {
    authService.clear();
    await showAuthPage();
    return;
  }

  await initApp();
});
