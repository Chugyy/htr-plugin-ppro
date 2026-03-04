import { loadActiveSequence, generateTranscription } from '../../core/jobs/transcriptionGeneration';
import type { TranscriptionResponse } from '@/core/types';

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

function clearLog(id: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
}

function updateGenerationSelection(): void {
  const group = document.getElementById('generation-track-group');
  if (!group) return;
  const checkboxes = group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  selectedTrackIndices = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => Number(cb.value));
  const btn = document.getElementById('btn-generate') as HTMLButtonElement | null;
  if (selectedTrackIndices.length === 0) {
    btn?.setAttribute('disabled', '');
  } else {
    btn?.removeAttribute('disabled');
  }
}

function renderTrackCheckboxes(tracks: Array<{ id: number; name: string; clipCount: number }>): void {
  const group = document.getElementById('generation-track-group');
  if (!group) return;
  group.innerHTML = '';
  selectedTrackIndices = tracks.map(t => t.id);

  for (const track of tracks) {
    const item = document.createElement('div');
    item.className = 'track__item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `gen-track-${track.id}`;
    cb.value = String(track.id);
    cb.checked = true;
    cb.addEventListener('change', updateGenerationSelection);

    const label = document.createElement('label');
    label.className = 'track__label';
    label.htmlFor = cb.id;
    label.textContent = `${track.name} (${track.clipCount} clips)`;

    const main = document.createElement('div');
    main.className = 'track__item__main';
    main.appendChild(cb);
    main.appendChild(label);

    item.appendChild(main);
    group.appendChild(item);
  }

  const btn = document.getElementById('btn-generate') as HTMLButtonElement | null;
  btn?.removeAttribute('disabled');
}

export function mountGenerationHooks(): void {
  const btnLoad = document.getElementById('btn-load-generation') as HTMLButtonElement | null;
  const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement | null;

  btnLoad?.addEventListener('click', async () => {
    clearLog('generation-logs');
    setStatus('generation-status', 'notice', 'Chargement...');
    btnLoad.setAttribute('disabled', '');
    try {
      const { sequenceName, tracks } = await loadActiveSequence();
      const seqName = document.getElementById('generation-sequence-name');
      if (seqName) seqName.textContent = `Séquence : ${sequenceName}`;
      renderTrackCheckboxes(tracks);
      document.getElementById('generation-loaded')?.removeAttribute('hidden');
      setStatus('generation-status', 'neutral', 'Prêt');
    } catch (err: any) {
      setStatus('generation-status', 'negative', err.message);
      appendLog('generation-logs', '✗ ' + err.message);
    } finally {
      btnLoad.removeAttribute('disabled');
    }
  });

  btnGenerate?.addEventListener('click', async () => {
    setStatus('generation-status', 'notice', 'Génération en cours...');
    btnGenerate.setAttribute('disabled', '');
    appendLog('generation-logs', '→ Lancement de la transcription...');
    try {
      const response: TranscriptionResponse = await generateTranscription(selectedTrackIndices);
      setStatus('generation-status', 'positive', 'Terminé');
      appendLog('generation-logs', `✓ Transcription importée (${response.wordCount} mots, ${response.duration}s)`);
    } catch (err: any) {
      setStatus('generation-status', 'negative', 'Erreur');
      appendLog('generation-logs', '✗ ' + err.message);
    } finally {
      btnGenerate.removeAttribute('disabled');
    }
  });
}
