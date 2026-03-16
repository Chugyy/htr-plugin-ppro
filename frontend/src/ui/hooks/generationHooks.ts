import { loadActiveSequence, generateTranscription } from '../../core/jobs/transcriptionGeneration';
import type { TrackSpeakerAssignment } from '../../core/jobs/transcriptionGeneration';
import type { TranscriptionResponse } from '@/core/types';

// ── State ──────────────────────────────────────────────────────────────────

interface SpeakerEntry { id: string; name: string; }

let speakers: SpeakerEntry[] = [];
let loadedTracks: Array<{ id: number; name: string; clipCount: number }> = [];

// ── Helpers ────────────────────────────────────────────────────────────────

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

  for (const speaker of speakers) {
    const item = document.createElement('div');
    item.className = 'speaker-item';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = speaker.name;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'speaker-item__remove';
    removeBtn.textContent = '✕';
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
    cb.checked = true;
    cb.addEventListener('change', () => {
      const select = document.getElementById(`gen-speaker-${track.id}`) as HTMLSelectElement | null;
      if (select) select.disabled = !cb.checked;
      updateGenerateButton();
    });

    const label = document.createElement('label');
    label.className = 'track__label';
    label.htmlFor = cb.id;
    label.textContent = `${track.name} (${track.clipCount} clips)`;

    const main = document.createElement('div');
    main.className = 'track__item__main';
    main.appendChild(cb);
    main.appendChild(label);

    const select = document.createElement('select');
    select.className = 'track__type-picker';
    select.id = `gen-speaker-${track.id}`;
    populateSpeakerDropdown(select);

    item.appendChild(main);
    item.appendChild(select);
    group.appendChild(item);
  }

  updateGenerateButton();
}

function populateSpeakerDropdown(select: HTMLSelectElement): void {
  const currentValue = select.value;
  select.innerHTML = '<option value="">— Aucun intervenant —</option>';
  for (const speaker of speakers) {
    const opt = document.createElement('option');
    opt.value = speaker.id;
    opt.textContent = speaker.name;
    select.appendChild(opt);
  }
  // Restore selection if still valid
  if (speakers.some(s => s.id === currentValue)) {
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
  const btn = document.getElementById('btn-generate') as HTMLButtonElement | null;
  const assignments = getAssignments();
  if (assignments.length > 0) {
    btn?.removeAttribute('disabled');
  } else {
    btn?.setAttribute('disabled', '');
  }
}

// ── Mount ─────────────────────────────────────────────────────────────────

export function mountGenerationHooks(): void {
  const btnLoad = document.getElementById('btn-load-generation') as HTMLButtonElement | null;
  const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement | null;
  const btnAddSpeaker = document.getElementById('btn-add-speaker') as HTMLButtonElement | null;
  const speakerInput = document.getElementById('speaker-name-input') as HTMLInputElement | null;

  // Add speaker
  btnAddSpeaker?.addEventListener('click', () => {
    if (speakerInput?.value) {
      addSpeaker(speakerInput.value);
      speakerInput.value = '';
    }
  });

  speakerInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && speakerInput.value) {
      addSpeaker(speakerInput.value);
      speakerInput.value = '';
    }
  });

  // Load sequence
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

  // Generate
  btnGenerate?.addEventListener('click', async () => {
    const assignments = getAssignments();
    if (assignments.length === 0) return;

    setStatus('generation-status', 'notice', 'Génération en cours...');
    btnGenerate.setAttribute('disabled', '');
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
      btnGenerate.removeAttribute('disabled');
    }
  });
}
