import { loadExistingTranscript, correctTranscription } from '../../core/jobs/transcriptionCorrection';
import type { CorrectionResponse } from '@/core/types';

let currentTranscriptText: string = '';
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

export function mountCorrectionHooks(): void {
  const btnLoad = document.getElementById('btn-load-correction');
  const btnCorrect = document.getElementById('btn-correct');

  btnLoad?.addEventListener('click', async () => {
    if (btnLoad.classList.contains('btn--disabled')) return;
    setStatus('correction-status', 'notice', 'Chargement...');
    btnLoad.classList.add('btn--disabled');

    try {
      currentTranscriptText = await loadExistingTranscript();
      document.getElementById('correction-process')?.removeAttribute('hidden');
      setStatus('correction-status', 'neutral', 'Transcription chargée');
      btnCorrect?.classList.remove('btn--disabled');
    } catch (err: any) {
      setStatus('correction-status', 'negative', err.message);
    } finally {
      btnLoad.classList.remove('btn--disabled');
    }
  });

  btnCorrect?.addEventListener('click', async () => {
    if (btnCorrect.classList.contains('btn--disabled')) return;

    setStatus('correction-status', 'notice', 'Correction en cours');
    btnCorrect.classList.add('btn--disabled');

    try {
      const response: CorrectionResponse = await correctTranscription(currentTranscriptText);
      setStatus('correction-status', 'positive', 'Terminé');

      const info = document.getElementById('correction-info');
      if (info) {
        info.removeAttribute('hidden');
        info.textContent = `✓ ${response.correctionCount || 0} correction(s) appliquée(s)`;
      }
    } catch (err: any) {
      setStatus('correction-status', 'negative', 'Erreur : ' + err.message);
    } finally {
      btnCorrect.classList.remove('btn--disabled');
    }
  });
}
