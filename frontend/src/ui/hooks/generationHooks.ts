import { loadActiveSequence, generateTranscription } from '../../core/jobs/transcriptionGeneration';
import type { TrackSpeakerAssignment } from '../../core/jobs/transcriptionGeneration';
import type { TranscriptionResponse } from '@/core/types';
import { createInput, createSelect } from '@/ui/components';
import { setStatus, setErrorStatus } from '@/ui/utils/status';
import { acquireLock, releaseLock } from '@/core/utils/operationLock';

// ── State ──────────────────────────────────────────────────────────────────

interface SpeakerEntry { id: string; name: string; }

let speakers: SpeakerEntry[] = [];
let loadedTracks: Array<{ id: number; name: string; clipCount: number }> = [];

// ── Helpers ────────────────────────────────────────────────────────────────

// setStatus and setErrorStatus imported from @/ui/utils/status

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

function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 14);
}

// ── Speaker management ────────────────────────────────────────────────────

function addSpeaker(name: string): void {
  if (!name.trim()) return;
  speakers.push({ id: generateId(), name: name.trim() });
  renderSpeakers();
  refreshTrackDropdowns();
}

function removeSpeaker(id: string): void {
  speakers = speakers.filter(s => s.id !== id);
  renderSpeakers();
  refreshTrackDropdowns();
}

function renderSpeakers(): void {
  const list = document.getElementById('speaker-list');
  if (!list) return;
  list.innerHTML = '';
  list.className = 'speaker-list';

  for (const speaker of speakers) {
    const item = document.createElement('div');
    item.className = 'speaker-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'speaker-item__name';
    nameSpan.textContent = speaker.name;

    const removeBtn = document.createElement('span');
    removeBtn.className = 'speaker-item__remove';
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('role', 'button');
    removeBtn.addEventListener('click', () => removeSpeaker(speaker.id));

    item.appendChild(nameSpan);
    item.appendChild(removeBtn);
    list.appendChild(item);
  }
}

// ── Track rendering ───────────────────────────────────────────────────────

function renderTrackCheckboxes(tracks: Array<{ id: number; name: string; clipCount: number }>): void {
  loadedTracks = tracks;
  const group = document.getElementById('generation-track-group');
  if (!group) return;
  group.innerHTML = '';

  for (const track of tracks) {
    const item = document.createElement('div');
    item.className = 'track__item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `gen-track-${track.id}`;
    cb.value = String(track.id);
    cb.checked = false;
    cb.addEventListener('change', () => {
      const sel = document.getElementById(`gen-speaker-${track.id}`) as HTMLSelectElement | null;
      if (sel) {
        sel.disabled = !cb.checked;
        sel.style.opacity = cb.checked ? '1' : '0.3';
        if (!cb.checked) sel.value = ''; // free up the speaker
      }
      refreshTrackDropdowns();
      updateGenerateButton();
    });

    const label = document.createElement('label');
    label.className = 'track__label';
    label.htmlFor = cb.id;
    label.textContent = track.name;

    const clipCount = document.createElement('span');
    clipCount.className = 'track__clip-count';
    clipCount.textContent = `${track.clipCount} clip${track.clipCount !== 1 ? 's' : ''}`;

    const main = document.createElement('div');
    main.className = 'track__item__main';
    main.appendChild(cb);
    main.appendChild(label);
    main.appendChild(clipCount);

    const selectWrapper = createSelect({
      id: `gen-speaker-${track.id}`,
      options: [{ value: '', label: '— Intervenant —' }],
    });
    selectWrapper.style.marginLeft = '22px';
    const select = selectWrapper.querySelector('select')!;
    populateSpeakerDropdown(select);
    select.addEventListener('change', () => {
      refreshTrackDropdowns();
      updateGenerateButton();
    });

    item.appendChild(main);
    item.appendChild(selectWrapper);
    group.appendChild(item);
  }

  updateGenerateButton();
}

function populateSpeakerDropdown(select: HTMLSelectElement): void {
  const currentValue = select.value;

  // Collect speakers already assigned in OTHER selects
  const takenIds = new Set<string>();
  for (const track of loadedTracks) {
    const other = document.getElementById(`gen-speaker-${track.id}`) as HTMLSelectElement | null;
    if (other && other !== select && other.value) {
      takenIds.add(other.value);
    }
  }

  select.innerHTML = '<option value="">— Intervenant —</option>';
  for (const speaker of speakers) {
    // Skip if taken by another track (but keep if it's this select's current value)
    if (takenIds.has(speaker.id) && speaker.id !== currentValue) continue;
    const opt = document.createElement('option');
    opt.value = speaker.id;
    opt.textContent = speaker.name;
    select.appendChild(opt);
  }
  if (speakers.some(s => s.id === currentValue) && !takenIds.has(currentValue)) {
    select.value = currentValue;
  }
}

function refreshTrackDropdowns(): void {
  for (const track of loadedTracks) {
    const select = document.getElementById(`gen-speaker-${track.id}`) as HTMLSelectElement | null;
    if (select) populateSpeakerDropdown(select);
  }
  updateGenerateButton();
}

// ── Validation ────────────────────────────────────────────────────────────

function getAssignments(): TrackSpeakerAssignment[] {
  const assignments: TrackSpeakerAssignment[] = [];
  for (const track of loadedTracks) {
    const cb = document.getElementById(`gen-track-${track.id}`) as HTMLInputElement | null;
    const select = document.getElementById(`gen-speaker-${track.id}`) as HTMLSelectElement | null;
    if (!cb?.checked || !select?.value) continue;
    const speaker = speakers.find(s => s.id === select.value);
    if (!speaker) continue;
    assignments.push({ trackIndex: track.id, speaker });
  }
  return assignments;
}

function updateGenerateButton(): void {
  const btn = document.getElementById('btn-generate');
  const assignments = getAssignments();
  if (assignments.length > 0) {
    btn?.classList.remove('btn--disabled');
  } else {
    btn?.classList.add('btn--disabled');
  }
}

// ── Mount ─────────────────────────────────────────────────────────────────

export function mountGenerationHooks(): void {
  const btnLoad = document.getElementById('btn-load-generation');
  const btnGenerate = document.getElementById('btn-generate');

  // Build speaker input + add button via JS (wrapper + transparent native)
  const container = document.getElementById('speaker-add-container');
  let speakerInputEl: HTMLInputElement | null = null;

  if (container) {
    container.style.cssText = 'display:flex;align-items:center;margin-top:12px';

    const inputWrapper = createInput({ placeholder: 'Nom de l\'intervenant' });
    inputWrapper.style.marginRight = '12px';
    speakerInputEl = inputWrapper.querySelector('input');

    const btnAdd = document.createElement('div');
    btnAdd.className = 'btn';
    btnAdd.setAttribute('role', 'button');
    btnAdd.tabIndex = 0;
    btnAdd.textContent = '+';
    btnAdd.style.margin = '0';

    container.appendChild(inputWrapper);
    container.appendChild(btnAdd);

    btnAdd.addEventListener('click', () => {
      if (speakerInputEl?.value) {
        addSpeaker(speakerInputEl.value);
        speakerInputEl.value = '';
      }
    });

    speakerInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && speakerInputEl?.value) {
        addSpeaker(speakerInputEl.value);
        speakerInputEl.value = '';
      }
    });
  }

  // Load sequence
  btnLoad?.addEventListener('click', async () => {
    if (btnLoad.classList.contains('btn--disabled')) return;
    if (!acquireLock('generation')) { setStatus('generation-status', 'notice', 'Opération en cours...'); return; }
    clearLog('generation-logs');
    setStatus('generation-status', 'notice', 'Chargement...');
    try {
      const { sequenceName, tracks } = await loadActiveSequence();
      const seqName = document.getElementById('generation-sequence-name');
      if (seqName) seqName.textContent = sequenceName;
      renderTrackCheckboxes(tracks);
      document.getElementById('generation-loaded')?.removeAttribute('hidden');
      setStatus('generation-status', 'neutral', 'Prêt');
    } catch (err: any) {
      setStatus('generation-status', 'negative', err.message);
      appendLog('generation-logs', '✗ ' + err.message);
    } finally {
      releaseLock();
    }
  });

  // Generate
  btnGenerate?.addEventListener('click', async () => {
    if (btnGenerate.classList.contains('btn--disabled')) return;
    const assignments = getAssignments();
    if (assignments.length === 0) return;

    if (!acquireLock('generation')) { setStatus('generation-status', 'notice', 'Opération en cours...'); return; }
    setStatus('generation-status', 'notice', 'Génération en cours...');
    appendLog('generation-logs', `→ Transcription de ${assignments.length} piste(s)...`);

    for (const a of assignments) {
      appendLog('generation-logs', `  • Piste ${a.trackIndex} → ${a.speaker.name}`);
    }

    try {
      const response: TranscriptionResponse = await generateTranscription(assignments);
      setStatus('generation-status', 'positive', 'Terminé');
      appendLog('generation-logs', `✓ Transcription importée (${response.wordCount} mots, ${response.duration}s)`);
    } catch (err: any) {
      setStatus('generation-status', 'negative', 'Erreur');
      appendLog('generation-logs', '✗ ' + err.message);
    } finally {
      releaseLock();
    }
  });
}
