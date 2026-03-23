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

  // ── Load sequence ──
  btnLoad?.addEventListener('click', async () => {
    if (btnLoad.classList.contains('btn--disabled')) return;
    btnLoad.classList.add('btn--disabled');
    setStatus('notice', 'Chargement...');

    try {
      const sequence = await getActiveSequence();
      const seqName = document.getElementById('derusher-sequence-name');
      if (seqName) seqName.textContent = sequence.name;

      await buildTrackSelector(sequence);

      const preview = document.getElementById('derusher-preview');
      if (preview) preview.textContent = '';

      document.getElementById('derusher-loaded')?.removeAttribute('hidden');
      setStatus('neutral', 'Prêt');
    } catch (err: any) {
      setStatus('negative', err.message);
    } finally {
      btnLoad.classList.remove('btn--disabled');
    }
  });

  // ── Detect + Remove in one click ──
  btnRemove?.addEventListener('click', async () => {
    if (btnRemove.classList.contains('btn--disabled')) return;

    const selected = document.querySelector<HTMLInputElement>('input[name="derusher-track"]:checked');
    if (!selected) return;

    const trackIndex = parseInt(selected.value, 10);
    btnRemove.classList.add('btn--disabled');

    try {
      // Phase 1: Detect
      setStatus('notice', 'Détection des silences...');
      const result = await detectSilences(
        trackIndex,
        (msg) => setStatus('notice', msg),
      );

      const preview = document.getElementById('derusher-preview');

      if (result.silences.length === 0) {
        if (preview) preview.textContent = 'Aucun silence détecté.';
        setStatus('neutral', 'Aucun silence à supprimer');
        return;
      }

      if (preview) {
        preview.textContent = `${result.silences.length} silence(s) détecté(s) — suppression en cours...`;
      }

      // Phase 2: Remove
      setStatus('notice', 'Suppression des blancs...');
      const removeResult = await removeSilencesFromTrack(
        trackIndex,
        'audio',
        result.silences,
        (_step, _total, msg) => setStatus('notice', msg),
      );

      if (preview) {
        preview.textContent = `${removeResult.removed} silence(s) supprimé(s) — ${removeResult.durationSaved.toFixed(1)}s récupéré(s)`;
      }
      setStatus('positive', 'Dérushage terminé');

    } catch (err: any) {
      setStatus('negative', err.message);
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
