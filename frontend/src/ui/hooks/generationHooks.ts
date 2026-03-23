import { loadActiveSequence, generateTranscription } from '../../core/jobs/transcriptionGeneration';
import type { TrackSpeakerAssignment } from '../../core/jobs/transcriptionGeneration';
import { detectSilences, removeSilencesFromTrack } from '../../core/jobs/silenceRemoval';
import type { TranscriptionResponse } from '@/core/types';
import { createInput, createSelect } from '@/ui/components';

// ── State ──────────────────────────────────────────────────────────────────

interface SpeakerEntry { id: string; name: string; }

let speakers: SpeakerEntry[] = [];
let loadedTracks: Array<{ id: number; name: string; clipCount: number }> = [];

// ── Helpers ────────────────────────────────────────────────────────────────

let blinkTimer: ReturnType<typeof setInterval> | null = null;

function setStatus(id: string, variant: 'neutral' | 'positive' | 'negative' | 'notice', text: string): void {
  const container = document.getElementById(id);
  if (!container) return;
  const dot = container.querySelector('.status__dot') as HTMLElement | null;
  const label = container.querySelector('.status__text');

  // Stop any previous blink
  if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }

  if (dot) {
    dot.hidden = false;
    dot.className = 'status__dot status__dot--' + variant;

    // Blink orange for "notice" (loading)
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
    clearLog('generation-logs');
    setStatus('generation-status', 'notice', 'Chargement...');
    btnLoad.classList.add('btn--disabled');
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
      btnLoad.classList.remove('btn--disabled');
    }
  });

  // Generate
  btnGenerate?.addEventListener('click', async () => {
    if (btnGenerate.classList.contains('btn--disabled')) return;
    const assignments = getAssignments();
    if (assignments.length === 0) return;

    setStatus('generation-status', 'notice', 'Génération en cours...');
    btnGenerate.classList.add('btn--disabled');
    appendLog('generation-logs', `→ Transcription de ${assignments.length} piste(s)...`);

    for (const a of assignments) {
      appendLog('generation-logs', `  • Piste ${a.trackIndex} → ${a.speaker.name}`);
    }

    try {
      const response: TranscriptionResponse = await generateTranscription(assignments);
      setStatus('generation-status', 'positive', 'Terminé');
      appendLog('generation-logs', `✓ Transcription importée (${response.wordCount} mots, ${response.duration}s)`);

      // Show silence removal panel
      showSilenceRemovalPanel();
    } catch (err: any) {
      setStatus('generation-status', 'negative', 'Erreur');
      appendLog('generation-logs', '✗ ' + err.message);
    } finally {
      btnGenerate.classList.remove('btn--disabled');
    }
  });

  // ── Silence removal ────────────────────────────────────────────────────

  const btnRemoveSilences = document.getElementById('btn-remove-silences');

  btnRemoveSilences?.addEventListener('click', async () => {
    if (btnRemoveSilences.classList.contains('btn--disabled')) return;

    const selected = document.querySelector<HTMLInputElement>('input[name="silence-track"]:checked');
    if (!selected) return;

    const [trackType, trackIndexStr] = selected.value.split(':');
    const trackIndex = parseInt(trackIndexStr, 10);

    setStatus('generation-status', 'notice', 'Suppression des blancs...');
    btnRemoveSilences.classList.add('btn--disabled');

    try {
      const result = await removeSilencesFromTrack(
        trackIndex,
        trackType as 'audio' | 'video',
        (_step, _total, msg) => {
          setStatus('generation-status', 'notice', msg);
        },
      );
      setStatus('generation-status', 'positive',
        `${result.removed} silence(s) supprimé(s) (${result.durationSaved.toFixed(1)}s)`
      );
    } catch (err: any) {
      setStatus('generation-status', 'negative', 'Erreur: ' + err.message);
    } finally {
      btnRemoveSilences.classList.remove('btn--disabled');
    }
  });
}

// ── Silence removal panel ────────────────────────────────────────────────────

async function showSilenceRemovalPanel(): Promise<void> {
  const panel = document.getElementById('silence-removal');
  if (!panel) return;

  try {
    // Detect silences from transcript
    const { silences, totalDuration } = await detectSilences();

    if (silences.length === 0) {
      panel.hidden = true;
      return;
    }

    // Show preview
    const preview = document.getElementById('silence-preview');
    if (preview) {
      preview.textContent = `${silences.length} silence(s) détecté(s) — ${totalDuration.toFixed(1)}s à supprimer`;
    }

    // Build track selector (audio + video tracks from active sequence)
    const selector = document.getElementById('silence-track-selector');
    if (selector) {
      selector.innerHTML = '';
      const { getActiveSequence } = await import('../../core/api/premiereProAPI');
      const sequence = await getActiveSequence();

      const audioCount = await sequence.getAudioTrackCount();
      const videoCount = await sequence.getVideoTrackCount();

      for (let i = 0; i < audioCount; i++) {
        const track = await sequence.getAudioTrack(i);
        const items = track.getTrackItems(1, false);
        if (items.length === 0) continue;
        selector.appendChild(createTrackRadio(
          `audio:${i}`,
          `${track.name || 'Audio ' + (i + 1)} (${items.length} clip${items.length > 1 ? 's' : ''})`,
          i === 0,
        ));
      }

      for (let i = 0; i < videoCount; i++) {
        const track = await sequence.getVideoTrack(i);
        const items = track.getTrackItems(1, false);
        if (items.length === 0) continue;
        selector.appendChild(createTrackRadio(
          `video:${i}`,
          `${track.name || 'Vidéo ' + (i + 1)} (${items.length} clip${items.length > 1 ? 's' : ''})`,
          false,
        ));
      }
    }

    // Enable button
    const btn = document.getElementById('btn-remove-silences');
    btn?.classList.remove('btn--disabled');

    panel.hidden = false;
  } catch (err) {
    console.error('[SILENCE] Failed to show panel:', err);
  }
}

function createTrackRadio(value: string, label: string, checked: boolean): HTMLElement {
  const item = document.createElement('div');
  item.className = 'track__item';
  item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'silence-track';
  radio.value = value;
  radio.checked = checked;
  radio.id = `silence-${value}`;

  const lbl = document.createElement('label');
  lbl.htmlFor = radio.id;
  lbl.className = 'track__label';
  lbl.textContent = label;

  item.appendChild(radio);
  item.appendChild(lbl);
  return item;
}
