import { detectSilences, removeSilencesFromTrack, type DerushOptions } from '../../core/jobs/silenceRemoval';
import { getActiveSequence, getActiveSequenceClipItem, exportTranscript } from '../../core/api/premiereProAPI';
import { createSelect } from '@/ui/components';
import { captureErrorReport } from '@/core/utils/bugReport';
import { acquireLock, releaseLock } from '@/core/utils/operationLock';

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

function readDerushOptions(): DerushOptions {
  const threshold = document.getElementById('derusher-threshold') as HTMLInputElement | null;
  const minDur = document.getElementById('derusher-min-duration') as HTMLInputElement | null;
  const padding = document.getElementById('derusher-padding') as HTMLInputElement | null;
  return {
    noiseThreshold: threshold ? parseFloat(threshold.value) : -30,
    minDuration: minDur ? parseFloat(minDur.value) : 0.5,
    padding: padding ? parseFloat(padding.value) : 0.2,
  };
}

function mountSliderLabels(): void {
  const pairs: Array<[string, string, (v: number) => string]> = [
    ['derusher-threshold', 'derusher-threshold-val', v => `${v} dB`],
    ['derusher-min-duration', 'derusher-min-duration-val', v => `${v.toFixed(1)}s`],
    ['derusher-padding', 'derusher-padding-val', v => `${v.toFixed(2)}s`],
  ];
  for (const [inputId, labelId, fmt] of pairs) {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    const label = document.getElementById(labelId);
    input?.addEventListener('input', () => {
      if (label) label.textContent = fmt(parseFloat(input.value));
    });
  }
}

async function checkTranscriptWarning(): Promise<void> {
  const warning = document.getElementById('derusher-transcript-warning');
  if (!warning) return;
  try {
    const clipItem = await getActiveSequenceClipItem();
    const transcript = await exportTranscript(clipItem);
    warning.hidden = !transcript;
  } catch {
    warning.hidden = true;
  }
}

export function mountDerusherHooks(): void {
  const btnLoad = document.getElementById('btn-load-derusher');
  const btnRemove = document.getElementById('btn-remove-silences');

  mountSliderLabels();

  // ── Load sequence ──
  btnLoad?.addEventListener('click', async () => {
    if (btnLoad.classList.contains('btn--disabled')) return;
    if (!acquireLock('derusher')) { setStatus('notice', 'Opération en cours...'); return; }
    setStatus('notice', 'Chargement...');

    try {
      const sequence = await getActiveSequence();
      const seqName = document.getElementById('derusher-sequence-name');
      if (seqName) seqName.textContent = sequence.name;

      const hasTrack = await buildTrackDropdown(sequence);

      document.getElementById('derusher-loaded')?.removeAttribute('hidden');

      if (hasTrack) {
        btnRemove?.classList.remove('btn--disabled');
      } else {
        btnRemove?.classList.add('btn--disabled');
      }

      await checkTranscriptWarning();
      setStatus('neutral', 'Prêt');
    } catch (err: any) {
      setStatus('negative', err.message);
      captureErrorReport('derusher', err);
    } finally {
      releaseLock();
    }
  });

  // ── Detect + Remove ──
  btnRemove?.addEventListener('click', async () => {
    if (btnRemove.classList.contains('btn--disabled')) return;

    const select = document.getElementById('derusher-track-select') as HTMLSelectElement | null;
    if (!select || !select.value) return;

    if (!acquireLock('derusher')) { setStatus('notice', 'Opération en cours...'); return; }

    const trackIndex = parseInt(select.value, 10);

    try {
      const options = readDerushOptions();

      setStatus('notice', 'Détection des silences...');
      const result = await detectSilences(
        trackIndex,
        (msg) => setStatus('notice', msg),
        options,
      );

      if (result.silences.length === 0) {
        setStatus('neutral', 'Aucun silence détecté');
        return;
      }

      setStatus('notice', `${result.silences.length} silence(s) — suppression...`);
      const removeResult = await removeSilencesFromTrack(
        trackIndex,
        result.silences,
        (_step, _total, msg) => setStatus('notice', msg),
        options,
      );

      setStatus('positive',
        `${removeResult.removed} silence(s) supprimé(s) — ${removeResult.durationSaved.toFixed(1)}s récupéré(s)`
      );
    } catch (err: any) {
      setStatus('negative', err.message);
      captureErrorReport('derusher', err);
    } finally {
      releaseLock();
    }
  });
}

// ── Track dropdown ───────────────────────────────────────────────────────────

async function buildTrackDropdown(sequence: any): Promise<boolean> {
  const container = document.getElementById('derusher-track-selector');
  if (!container) return false;
  container.innerHTML = '';

  const options: Array<{ value: string; label: string }> = [];
  const audioCount = await sequence.getAudioTrackCount();

  for (let i = 0; i < audioCount; i++) {
    const track = await sequence.getAudioTrack(i);
    const items = track.getTrackItems(1, false);
    if (items.length === 0) continue;
    options.push({
      value: String(i),
      label: `${track.name || 'Audio ' + (i + 1)} — ${items.length} clip${items.length > 1 ? 's' : ''}`,
    });
  }

  if (options.length === 0) return false;

  const wrapper = createSelect({
    id: 'derusher-track-select',
    options,
    selected: options[0].value,
  });
  container.appendChild(wrapper);

  return true;
}
