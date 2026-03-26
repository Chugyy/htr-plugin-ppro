import './styles/main.css';
import { validateApiKey } from '@/core/api/authAPI';
import { authService } from '@/core/services/authService';
import { mountAuthHooks } from './hooks/authHooks';
import { mountGenerationHooks } from './hooks/generationHooks';
import { mountCorrectionHooks } from './hooks/correctionHooks';
import { mountAudioHooks } from './hooks/audioHooks';
import { mountDerusherHooks } from './hooks/derusherHooks';
import { mountColorHooks } from './hooks/colorHooks';

async function loadPages(): Promise<void> {
  const pages: Array<{ id: string; path: string }> = [
    { id: 'tab-generation', path: './pages/generation.html' },
    { id: 'tab-correction', path: './pages/correction.html' },
    { id: 'tab-derusher',   path: './pages/derusher.html' },
    { id: 'tab-color',      path: './pages/color.html' },
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
  document.querySelector<HTMLElement>('.tabs-container')!.removeAttribute('hidden');
  initTabNavigation();
  mountGenerationHooks();
  mountCorrectionHooks();
  mountDerusherHooks();
  mountColorHooks();
  mountAudioHooks();
}

function mountDevBadge(): void {
  if (import.meta.env.VITE_MODE !== 'development') return;
  const badge = document.createElement('div');
  badge.textContent = `DEV · ${import.meta.env.VITE_BACKEND_URL}`;
  badge.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#f59e0b;color:#000;font-size:10px;text-align:center;padding:2px 4px;z-index:9999;opacity:0.85;';
  document.body.appendChild(badge);
}

document.addEventListener('DOMContentLoaded', async () => {
  mountDevBadge();
  try {
    const storedKey = authService.get();
    const isAuthed  = storedKey ? await validateApiKey(storedKey) : false;

    if (!isAuthed) {
      authService.clear();
      await showAuthPage();
      return;
    }

    await initApp();
  } catch (err) {
    console.error('[App] Init failed:', err);
    authService.clear();
    await showAuthPage();
  }
});
