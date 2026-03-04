import { loadExistingTranscript, correctTranscription } from '../../core/jobs/transcriptionCorrection';
import type { CorrectionResponse } from '@/core/types';

let currentTranscriptText: string = '';

function setStatus(id: string, variant: 'neutral' | 'positive' | 'negative' | 'notice', text: string): void {
  const container = document.getElementById(id);
  if (!container) return;
  const dot = container.querySelector('.status__dot');
  const label = container.querySelector('.status__text');
  if (dot) { dot.className = 'status__dot status__dot--' + variant; }
  if (label) { label.textContent = text; }
}

export function mountCorrectionHooks(): void {
  const btnLoad = document.getElementById('btn-load-correction');
  const btnCorrect = document.getElementById('btn-correct');

  btnLoad?.addEventListener('click', async () => {
    setStatus('correction-status', 'notice', 'Chargement...');
    btnLoad.setAttribute('disabled', '');

    try {
      currentTranscriptText = await loadExistingTranscript();
      const process = document.getElementById('correction-process');
      const textarea = document.getElementById('correction-transcript') as HTMLTextAreaElement;
      if (textarea) textarea.value = currentTranscriptText;
      process?.removeAttribute('hidden');
      setStatus('correction-status', 'neutral', 'Transcription chargée');
      btnCorrect?.removeAttribute('disabled');
    } catch (err: any) {
      setStatus('correction-status', 'negative', err.message);
    } finally {
      btnLoad.removeAttribute('disabled');
    }
  });

  btnCorrect?.addEventListener('click', async () => {
    const textarea = document.getElementById('correction-transcript') as HTMLTextAreaElement;
    const text = textarea?.value ?? '';

    setStatus('correction-status', 'notice', 'Correction en cours...');
    btnCorrect.setAttribute('disabled', '');

    try {
      const response: CorrectionResponse = await correctTranscription(text);
      setStatus('correction-status', 'positive', 'Terminé');

      const info = document.getElementById('correction-info');
      if (info) {
        info.removeAttribute('hidden');
        info.textContent = `✓ ${response.correctionCount || 0} correction(s) appliquée(s)`;
      }
    } catch (err: any) {
      setStatus('correction-status', 'negative', 'Erreur : ' + err.message);
    } finally {
      btnCorrect.removeAttribute('disabled');
    }
  });
}
