import { detectSilences, removeSilencesFromTrack } from '../../core/jobs/silenceRemoval';
import type { Silence } from '../../core/jobs/silenceRemoval';
import { getActiveSequence } from '../../core/api/premiereProAPI';

// ── State ────────────────────────────────────────────────────────────────────

let detectedSilences: Silence[] = [];
let selectedTrackIndex = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

let blinkTimer: ReturnType<typeof setInterval> | null = null;

function setStatus(variant: 'neutral' | 'positive' | 'negative' | 'notice', text: string): void {
  const container = document.getElementById('derusher-status');
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

// ── Mount ────────────────────────────────────────────────────────────────────

export function mountDerusherHooks(): void {
  const btnLoad = document.getElementById('btn-load-derusher');
  const btnRemove = document.getElementById('btn-remove-silences');

  // ── Load sequence + build track selector ──
  btnLoad?.addEventListener('click', async () => {
    if (btnLoad.classList.contains('btn--disabled')) return;
    btnLoad.classList.add('btn--disabled');
    setStatus('notice', 'Chargement...');
    detectedSilences = [];

    try {
      const sequence = await getActiveSequence();
      const seqName = document.getElementById('derusher-sequence-name');
      if (seqName) seqName.textContent = sequence.name;

      await buildTrackSelector(sequence);

      // Hide preview until detection
      const preview = document.getElementById('derusher-preview');
      if (preview) preview.textContent = '';

      document.getElementById('derusher-loaded')?.removeAttribute('hidden');
      btnRemove?.classList.add('btn--disabled');

      setStatus('neutral', 'Sélectionnez une piste puis lancez la détection');
    } catch (err: any) {
      setStatus('negative', err.message);
    } finally {
      btnLoad.classList.remove('btn--disabled');
    }
  });

  // ── Detect silences on selected track ──
  const btnDetect = document.getElementById('btn-detect-silences');
  btnDetect?.addEventListener('click', async () => {
    if (btnDetect.classList.contains('btn--disabled')) return;

    const selected = document.querySelector<HTMLInputElement>('input[name="derusher-track"]:checked');
    if (!selected) return;

    selectedTrackIndex = parseInt(selected.value, 10);
    btnDetect.classList.add('btn--disabled');
    setStatus('notice', 'Détection des silences...');

    try {
      const result = await detectSilences(
        selectedTrackIndex,
        (msg) => setStatus('notice', msg),
      );

      detectedSilences = result.silences;

      const preview = document.getElementById('derusher-preview');
      if (preview) {
        if (detectedSilences.length === 0) {
          preview.textContent = 'Aucun silence détecté.';
        } else {
          preview.textContent = `${detectedSilences.length} silence(s) — ${result.totalDuration.toFixed(1)}s à supprimer (sur ${result.audioDuration.toFixed(1)}s d'audio)`;
        }
      }

      if (detectedSilences.length > 0) {
        btnRemove?.classList.remove('btn--disabled');
      }

      setStatus('positive', `${detectedSilences.length} silence(s) détecté(s)`);
    } catch (err: any) {
      setStatus('negative', err.message);
    } finally {
      btnDetect.classList.remove('btn--disabled');
    }
  });

  // ── Remove silences ──
  btnRemove?.addEventListener('click', async () => {
    if (btnRemove.classList.contains('btn--disabled')) return;
    if (detectedSilences.length === 0) return;

    setStatus('notice', 'Suppression des blancs...');
    btnRemove.classList.add('btn--disabled');

    try {
      const result = await removeSilencesFromTrack(
        selectedTrackIndex,
        'audio',
        detectedSilences,
        (_step, _total, msg) => setStatus('notice', msg),
      );

      setStatus('positive',
        `${result.removed} silence(s) supprimé(s) (${result.durationSaved.toFixed(1)}s)`
      );
      detectedSilences = [];
    } catch (err: any) {
      setStatus('negative', 'Erreur: ' + err.message);
    } finally {
      btnRemove.classList.remove('btn--disabled');
    }
  });
}

// ── Track selector ───────────────────────────────────────────────────────────

async function buildTrackSelector(sequence: any): Promise<void> {
  const selector = document.getElementById('derusher-track-selector');
  if (!selector) return;
  selector.innerHTML = '';

  let firstChecked = false;
  const audioCount = await sequence.getAudioTrackCount();

  for (let i = 0; i < audioCount; i++) {
    const track = await sequence.getAudioTrack(i);
    const items = track.getTrackItems(1, false);
    if (items.length === 0) continue;

    const checked = !firstChecked;
    firstChecked = true;

    const item = document.createElement('div');
    item.className = 'track__item';
    item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'derusher-track';
    radio.value = String(i);
    radio.checked = checked;
    radio.id = `derusher-audio-${i}`;

    const lbl = document.createElement('label');
    lbl.htmlFor = radio.id;
    lbl.className = 'track__label';
    lbl.textContent = `${track.name || 'Audio ' + (i + 1)} (${items.length} clip${items.length > 1 ? 's' : ''})`;

    item.appendChild(radio);
    item.appendChild(lbl);
    selector.appendChild(item);
  }
}
