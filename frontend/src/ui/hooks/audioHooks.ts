import { loadAudioTracks, optimizeAudio } from '../../core/jobs/audioEnhancement';
import type { OptimizationResponse } from '@/core/types';

let selectedTrackIndices: number[] = [];

function setStatus(id: string, variant: 'neutral' | 'positive' | 'negative' | 'notice', text: string): void {
  const container = document.getElementById(id);
  if (!container) return;
  const dot = container.querySelector('.status__dot');
  const label = container.querySelector('.status__text');
  if (dot) dot.className = 'status__dot status__dot--' + variant;
  if (label) label.textContent = text;
}

function appendLog(id: string, msg: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent += (el.textContent ? '\n' : '') + msg;
  el.scrollTop = el.scrollHeight;
}

function updateAudioSelection(): void {
  const group = document.getElementById('audio-track-group');
  if (!group) return;
  const checkboxes = group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  selectedTrackIndices = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => Number(cb.value));
  const btn = document.getElementById('btn-optimize') as HTMLButtonElement | null;
  if (selectedTrackIndices.length > 0) {
    btn?.removeAttribute('disabled');
  } else {
    btn?.setAttribute('disabled', '');
  }
}

function renderAudioTrackCheckboxes(tracks: Array<{ id: number; name: string; duration: string; clips: number }>): void {
  const group = document.getElementById('audio-track-group');
  if (!group) return;
  group.innerHTML = '';
  selectedTrackIndices = [];

  const btn = document.getElementById('btn-optimize') as HTMLButtonElement | null;
  btn?.setAttribute('disabled', '');

  for (const track of tracks) {
    const item = document.createElement('div');
    item.className = 'track__item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `audio-track-${track.id}`;
    cb.value = String(track.id);
    cb.checked = false;

    const label = document.createElement('label');
    label.className = 'track__label';
    label.htmlFor = cb.id;
    label.textContent = `${track.name} — ${track.duration} (${track.clips} clips)`;

    const select = document.createElement('select');
    select.className = 'track__type-picker';
    select.id = `audio-type-${track.id}`;
    select.disabled = true;
    select.innerHTML = `
      <option value="voice">Voix</option>
      <option value="music">Musique</option>
      <option value="sound_effects">Effets sonores</option>
    `;

    cb.addEventListener('change', () => {
      select.disabled = !cb.checked;
      updateAudioSelection();
    });

    const main = document.createElement('div');
    main.className = 'track__item__main';
    main.appendChild(cb);
    main.appendChild(label);

    item.appendChild(main);
    item.appendChild(select);
    group.appendChild(item);
  }
}

export function mountAudioHooks(): void {
  const btnLoad = document.getElementById('btn-load-audio') as HTMLButtonElement | null;
  const btnOptimize = document.getElementById('btn-optimize') as HTMLButtonElement | null;

  btnLoad?.addEventListener('click', async () => {
    setStatus('audio-status', 'notice', 'Chargement...');
    btnLoad.setAttribute('disabled', '');
    try {
      const tracks = await loadAudioTracks();
      renderAudioTrackCheckboxes(tracks);
      document.getElementById('audio-loaded')?.removeAttribute('hidden');
      setStatus('audio-status', 'neutral', 'Prêt');
    } catch (err: any) {
      setStatus('audio-status', 'negative', err.message);
    } finally {
      btnLoad.removeAttribute('disabled');
    }
  });

  btnOptimize?.addEventListener('click', async () => {
    setStatus('audio-status', 'notice', 'Optimisation en cours...');
    btnOptimize.setAttribute('disabled', '');
    const selectedTracks = selectedTrackIndices.map(index => ({
      index,
      filterType: (document.getElementById(`audio-type-${index}`) as HTMLSelectElement)?.value as 'voice' | 'music' | 'sound_effects' ?? 'voice',
    }));
    appendLog('audio-logs', `→ Optimisation de ${selectedTracks.length} piste(s)`);
    try {
      const response: OptimizationResponse = await optimizeAudio(selectedTracks);
      setStatus('audio-status', 'positive', 'Terminé');
      appendLog('audio-logs', `✓ ${response.optimizedTracks?.length || 0} piste(s) optimisée(s) (${response.processingTime}s)`);
    } catch (err: any) {
      setStatus('audio-status', 'negative', 'Erreur');
      appendLog('audio-logs', '✗ ' + err.message);
    } finally {
      btnOptimize.removeAttribute('disabled');
    }
  });
}
