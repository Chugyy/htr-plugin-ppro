/**
 * Color Correction Hooks — Wire UI to the color correction job.
 */

import type { VideoTrackInfo } from '@/core/types';
import type { LogProfile } from '@/core/types';
import { loadVideoTracks, runColorCorrection, resetColorCorrection, detectExistingLumetri } from '@/core/jobs/colorCorrection';
import type { CorrectedClip } from '@/core/jobs/colorCorrection';
import { setStatus, setErrorStatus } from '@/ui/utils/status';
import { acquireLock, releaseLock } from '@/core/utils/operationLock';

// ── State ──────────────────────────────────────────────

let tracks: VideoTrackInfo[] = [];
let selectedIndices: Set<number> = new Set();
let correctedClips: CorrectedClip[] = [];

// ── Helpers ────────────────────────────────────────────

function getSelectedLogProfile(): LogProfile {
  const select = document.getElementById('log-profile-select') as HTMLSelectElement | null;
  return (select?.value as LogProfile) || 'auto';
}

function updateButtons(): void {
  const btnCorrect = document.getElementById('btn-correct');
  const btnReset = document.getElementById('btn-reset-color');
  if (!btnCorrect || !btnReset) return;

  if (correctedClips.length > 0) {
    btnCorrect.setAttribute('hidden', '');
    btnReset.removeAttribute('hidden');
  } else {
    btnCorrect.removeAttribute('hidden');
    btnReset.setAttribute('hidden', '');
  }
}

function renderTracks(): void {
  const container = document.getElementById('color-track-group');
  if (!container) return;

  container.innerHTML = tracks.map(track => {
    const uniqueMedia = new Set(track.clips.map(c => c.sourceFilePath)).size;

    return `
      <label class="track__item">
        <input type="checkbox" value="${track.trackIndex}" class="color-track-cb" />
        <div class="track__info">
          <span class="track__name">${track.trackName}</span>
          <span class="track__meta">${track.clipCount} clip(s) — ${uniqueMedia} média(s)</span>
        </div>
      </label>
    `;
  }).join('');

  container.querySelectorAll<HTMLInputElement>('.color-track-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.value);
      if (cb.checked) selectedIndices.add(idx);
      else selectedIndices.delete(idx);
    });
  });
}

// ── Load sequence ──────────────────────────────────────

async function handleLoad(): Promise<void> {
  if (!acquireLock('color')) { setStatus('color-status', 'notice', 'Opération en cours...'); return; }

  try {
    setStatus('color-status', 'loading', 'Chargement...');
    tracks = await loadVideoTracks();

    if (tracks.length === 0) {
      setStatus('color-status', 'warning', 'Aucune piste vidéo trouvée');
      return;
    }

    selectedIndices.clear();
    renderTracks();
    document.getElementById('color-loaded')?.removeAttribute('hidden');

    // Detect clips that already have Lumetri (from a previous correction)
    const existing = await detectExistingLumetri(tracks);
    correctedClips = existing;
    updateButtons();

    const totalClips = tracks.reduce((n, t) => n + t.clipCount, 0);
    const lumetriInfo = existing.length > 0 ? ` — ${existing.length} déjà corrigé(s)` : '';
    setStatus('color-status', 'success', `${tracks.length} piste(s), ${totalClips} clip(s)${lumetriInfo}`);
  } catch (err: any) {
    console.error('[COLOR] Load failed:', err);
    setErrorStatus('color-status', err.message);
  } finally {
    releaseLock();
  }
}

// ── Run correction ─────────────────────────────────────

async function handleCorrect(): Promise<void> {
  if (selectedIndices.size === 0) {
    setErrorStatus('color-status', 'Sélectionnez au moins une piste');
    return;
  }
  if (!acquireLock('color')) { setStatus('color-status', 'notice', 'Opération en cours...'); return; }

  try {
    const result = await runColorCorrection(
      [...selectedIndices],
      tracks,
      getSelectedLogProfile(),
      (progress) => {
        const pct = progress.current && progress.total
          ? ` (${progress.current}/${progress.total})`
          : '';
        setStatus('color-status', progress.stage === 'error' ? 'error' : 'loading', `${progress.message}${pct}`);
      },
    );

    correctedClips = result.correctedClips;
    updateButtons();
    setStatus('color-status', 'success', `Terminé — ${result.mediaCount} média(s), ${result.clipCount} clip(s)`);
  } catch (err: any) {
    console.error('[COLOR] Correction failed:', err);
    setErrorStatus('color-status', err.message);
  } finally {
    releaseLock();
  }
}

// ── Reset correction ───────────────────────────────────

async function handleReset(): Promise<void> {
  if (correctedClips.length === 0) return;
  if (!acquireLock('color')) { setStatus('color-status', 'notice', 'Opération en cours...'); return; }

  try {
    await resetColorCorrection(
      correctedClips,
      (progress) => {
        const pct = progress.current && progress.total
          ? ` (${progress.current}/${progress.total})`
          : '';
        setStatus('color-status', 'loading', `${progress.message}${pct}`);
      },
    );

    correctedClips = [];
    updateButtons();
    setStatus('color-status', 'success', 'Corrections supprimées');
  } catch (err: any) {
    console.error('[COLOR] Reset failed:', err);
    setErrorStatus('color-status', err.message);
  } finally {
    releaseLock();
  }
}

// ── Mount ──────────────────────────────────────────────

export function mountColorHooks(): void {
  const panel = document.getElementById('tab-color');
  if (!panel) return;

  panel.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest?.('[id]') as HTMLElement | null;
    if (!target) return;

    if (target.id === 'btn-load-color') handleLoad();
    else if (target.id === 'btn-correct') handleCorrect();
    else if (target.id === 'btn-reset-color') handleReset();
  });
}
