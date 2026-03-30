import { loadExistingTranscript, correctTranscription } from '../../core/jobs/transcriptionCorrection';
import type { CorrectionResponse } from '@/core/types';
import { setStatus, setErrorStatus } from '@/ui/utils/status';
import { acquireLock, releaseLock } from '@/core/utils/operationLock';

let currentTranscriptText: string = '';

export function mountCorrectionHooks(): void {
  const btnLoad = document.getElementById('btn-load-correction');
  const btnCorrect = document.getElementById('btn-correct');

  btnLoad?.addEventListener('click', async () => {
    if (btnLoad.classList.contains('btn--disabled')) return;
    if (!acquireLock('correction')) { setStatus('correction-status', 'notice', 'Opération en cours...'); return; }
    setStatus('correction-status', 'notice', 'Chargement...');

    try {
      currentTranscriptText = await loadExistingTranscript();
      document.getElementById('correction-process')?.removeAttribute('hidden');
      setStatus('correction-status', 'neutral', 'Transcription chargée');
      btnCorrect?.classList.remove('btn--disabled');
    } catch (err: any) {
      setStatus('correction-status', 'negative', err.message);
    } finally {
      releaseLock();
    }
  });

  btnCorrect?.addEventListener('click', async () => {
    if (btnCorrect.classList.contains('btn--disabled')) return;
    if (!acquireLock('correction')) { setStatus('correction-status', 'notice', 'Opération en cours...'); return; }

    setStatus('correction-status', 'notice', 'Correction en cours');

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
      releaseLock();
    }
  });
}
