import { detectSilences, removeSilencesFromTrack } from '../../core/jobs/silenceRemoval';
import { getActiveSequence } from '../../core/api/premiereProAPI';

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

  // ── Load sequence + detect silences ──
  btnLoad?.addEventListener('click', async () => {
    if (btnLoad.classList.contains('btn--disabled')) return;
    btnLoad.classList.add('btn--disabled');
    setStatus('notice', 'Chargement...');

    try {
      const sequence = await getActiveSequence();
      const seqName = document.getElementById('derusher-sequence-name');
      if (seqName) seqName.textContent = sequence.name;

      // Detect silences from transcript
      const { silences, totalDuration } = await detectSilences();

      // Preview
      const preview = document.getElementById('derusher-preview');
      if (preview) {
        if (silences.length === 0) {
          preview.textContent = 'Aucun silence détecté dans la transcription.';
        } else {
          preview.textContent = `${silences.length} silence(s) — ${totalDuration.toFixed(1)}s à supprimer`;
        }
      }

      // Build track selector
      await buildTrackSelector(sequence);

      // Show panel
      document.getElementById('derusher-loaded')?.removeAttribute('hidden');

      // Enable button only if silences exist
      if (silences.length > 0) {
        btnRemove?.classList.remove('btn--disabled');
      } else {
        btnRemove?.classList.add('btn--disabled');
      }

      setStatus('neutral', 'Prêt');
    } catch (err: any) {
      setStatus('negative', err.message);
    } finally {
      btnLoad.classList.remove('btn--disabled');
    }
  });

  // ── Remove silences ──
  btnRemove?.addEventListener('click', async () => {
    if (btnRemove.classList.contains('btn--disabled')) return;

    const selected = document.querySelector<HTMLInputElement>('input[name="derusher-track"]:checked');
    if (!selected) return;

    const [trackType, trackIndexStr] = selected.value.split(':');
    const trackIndex = parseInt(trackIndexStr, 10);

    setStatus('notice', 'Suppression des blancs...');
    btnRemove.classList.add('btn--disabled');

    try {
      const result = await removeSilencesFromTrack(
        trackIndex,
        trackType as 'audio' | 'video',
        (_step, _total, msg) => setStatus('notice', msg),
      );

      setStatus('positive',
        `${result.removed} silence(s) supprimé(s) (${result.durationSaved.toFixed(1)}s)`
      );
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
    selector.appendChild(createTrackRadio(
      `audio:${i}`,
      `${track.name || 'Audio ' + (i + 1)} (${items.length} clip${items.length > 1 ? 's' : ''})`,
      checked,
    ));
  }

  const videoCount = await sequence.getVideoTrackCount();
  for (let i = 0; i < videoCount; i++) {
    const track = await sequence.getVideoTrack(i);
    const items = track.getTrackItems(1, false);
    if (items.length === 0) continue;
    const checked = !firstChecked;
    firstChecked = true;
    selector.appendChild(createTrackRadio(
      `video:${i}`,
      `${track.name || 'Vidéo ' + (i + 1)} (${items.length} clip${items.length > 1 ? 's' : ''})`,
      checked,
    ));
  }
}

function createTrackRadio(value: string, label: string, checked: boolean): HTMLElement {
  const item = document.createElement('div');
  item.className = 'track__item';
  item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'derusher-track';
  radio.value = value;
  radio.checked = checked;
  radio.id = `derusher-${value}`;

  const lbl = document.createElement('label');
  lbl.htmlFor = radio.id;
  lbl.className = 'track__label';
  lbl.textContent = label;

  item.appendChild(radio);
  item.appendChild(lbl);
  return item;
}
