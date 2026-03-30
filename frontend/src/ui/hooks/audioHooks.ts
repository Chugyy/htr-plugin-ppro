import { loadAudioTracks, optimizeAudio } from '../../core/jobs/audioEnhancement';
import type { OptimizationResponse } from '@/core/types';
import { createInput, createSelect } from '@/ui/components';
import { captureErrorReport } from '@/core/utils/bugReport';
import { acquireLock, releaseLock } from '@/core/utils/operationLock';

// ── State ──────────────────────────────────────────────────────────────────

let selectedTrackIndices: number[] = [];

let blinkTimer: ReturnType<typeof setInterval> | null = null;

function setStatus(id: string, variant: 'neutral' | 'positive' | 'negative' | 'notice', text: string): void {
  const container = document.getElementById(id);
  if (!container) return;
  const dot = container.querySelector('.status__dot') as HTMLElement | null;
  const label = container.querySelector('.status__text');

  if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }

  if (dot) {
    dot.hidden = false;
    dot.className = 'status__dot status__dot--' + variant;
    if (variant === 'notice') {
      let bright = true;
      blinkTimer = setInterval(() => {
        dot.style.background = bright ? '#cc7a00' : '#ff9800';
        bright = !bright;
      }, 500);
    } else {
      dot.style.background = '';
    }
  }
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
  const btn = document.getElementById('btn-optimize');
  if (selectedTrackIndices.length > 0) {
    btn?.classList.remove('btn--disabled');
  } else {
    btn?.classList.add('btn--disabled');
  }
}

function renderAudioTrackCheckboxes(tracks: Array<{ id: number; name: string; duration: string; clips: number }>): void {
  const group = document.getElementById('audio-track-group');
  if (!group) return;
  group.innerHTML = '';
  selectedTrackIndices = [];

  const btn = document.getElementById('btn-optimize');
  btn?.classList.add('btn--disabled');

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
    label.textContent = `${track.name} — ${track.duration}`;

    const clipCount = document.createElement('span');
    clipCount.className = 'track__clip-count';
    clipCount.textContent = `${track.clips} clip${track.clips !== 1 ? 's' : ''}`;

    const selectWrapper = createSelect({
      id: `audio-type-${track.id}`,
      options: [
        { value: 'voice', label: 'Voix' },
        { value: 'music', label: 'Musique' },
        { value: 'sound_effects', label: 'Effets sonores' },
      ],
      disabled: true,
    });
    selectWrapper.style.marginLeft = '22px';
    const selectEl = selectWrapper.querySelector('select')!;

    cb.addEventListener('change', () => {
      selectEl.disabled = !cb.checked;
      selectWrapper.style.opacity = cb.checked ? '1' : '0.35';
      updateAudioSelection();
    });

    const main = document.createElement('div');
    main.className = 'track__item__main';
    main.appendChild(cb);
    main.appendChild(label);
    main.appendChild(clipCount);

    item.appendChild(main);
    item.appendChild(selectWrapper);
    group.appendChild(item);
  }
}

export function mountAudioHooks(): void {
  const btnLoad = document.getElementById('btn-load-audio');
  const btnOptimize = document.getElementById('btn-optimize');

  // Build output-dir input via JS (wrapper approach)
  const outputContainer = document.getElementById('output-dir-container');
  if (outputContainer) {
    const outputWrapper = createInput({ id: 'output-dir', placeholder: '/chemin/vers/dossier' });
    outputContainer.appendChild(outputWrapper);
  }

  btnLoad?.addEventListener('click', async () => {
    if (btnLoad.classList.contains('btn--disabled')) return;
    if (!acquireLock('audio')) { setStatus('audio-status', 'notice', 'Opération en cours...'); return; }
    setStatus('audio-status', 'notice', 'Chargement...');
    try {
      const { tracks, projectDir } = await loadAudioTracks();
      renderAudioTrackCheckboxes(tracks);
      const outInput = document.getElementById('output-dir') as HTMLInputElement | null;
      if (outInput) outInput.value = projectDir;
      document.getElementById('audio-loaded')?.removeAttribute('hidden');
      setStatus('audio-status', 'neutral', 'Prêt');
    } catch (err: any) {
      setStatus('audio-status', 'negative', err.message);
      captureErrorReport('audio', err);
    } finally {
      releaseLock();
    }
  });

  btnOptimize?.addEventListener('click', async () => {
    if (btnOptimize.classList.contains('btn--disabled')) return;
    if (!acquireLock('audio')) { setStatus('audio-status', 'notice', 'Opération en cours...'); return; }
    setStatus('audio-status', 'notice', 'Optimisation en cours...');
    const selectedTracks = selectedTrackIndices.map(index => ({
      index,
      filterType: (document.getElementById(`audio-type-${index}`) as HTMLSelectElement)?.value as 'voice' | 'music' | 'sound_effects' ?? 'voice',
    }));
    appendLog('audio-logs', `→ Optimisation de ${selectedTracks.length} piste(s)`);
    try {
      const outputDir = (document.getElementById('output-dir') as HTMLInputElement)?.value?.trim() || '';
      const response: OptimizationResponse = await optimizeAudio(
        selectedTracks,
        outputDir,
        (msg) => setStatus('audio-status', 'notice', msg),
      );
      setStatus('audio-status', 'positive', 'Terminé');
      appendLog('audio-logs', `✓ ${response.optimizedTracks?.length || 0} piste(s) optimisée(s) (${response.processingTime}s)`);
    } catch (err: any) {
      setStatus('audio-status', 'negative', 'Erreur');
      appendLog('audio-logs', '✗ ' + err.message);
      captureErrorReport('audio', err);
    } finally {
      releaseLock();
    }
  });
}
