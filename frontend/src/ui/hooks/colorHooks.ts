/**
 * Color Correction Hooks — Wire UI to the color correction job.
 */

import type { VideoTrackInfo } from '@/core/types';
import { loadVideoTracks, runColorCorrection } from '@/core/jobs/colorCorrection';
import { setStatus, setErrorStatus } from '@/ui/utils/status';

// ── State ──────────────────────────────────────────────

let tracks: VideoTrackInfo[] = [];
let selectedIndices: Set<number> = new Set();

// ── Helpers ────────────────────────────────────────────

// No disabled state — validation is in handleCorrect

function renderTracks(): void {
  const container = document.getElementById('color-track-group');
  if (!container) return;

  container.innerHTML = tracks.map(track => {
    // Count unique media sources
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

  // Bind checkbox events (use both change + click for UXP compatibility)
  container.querySelectorAll<HTMLInputElement>('.color-track-cb').forEach(cb => {
    const handler = () => {
      const idx = parseInt(cb.value);
      console.log(`[COLOR] Checkbox track ${idx}: checked=${cb.checked}`);
      if (cb.checked) selectedIndices.add(idx);
      else selectedIndices.delete(idx);
      console.log(`[COLOR] selectedIndices: [${[...selectedIndices].join(',')}]`);
    };
    cb.addEventListener('change', handler);
  });
}

// ── Load sequence ──────────────────────────────────────

async function handleLoad(): Promise<void> {
  setStatus('color-status', 'loading', 'Chargement...');

  try {
    tracks = await loadVideoTracks();

    if (tracks.length === 0) {
      setStatus('color-status', 'warning', 'Aucune piste vidéo trouvée');
      return;
    }

    selectedIndices.clear();
    renderTracks();
    document.getElementById('color-loaded')?.removeAttribute('hidden');

    const totalClips = tracks.reduce((n, t) => n + t.clipCount, 0);
    setStatus('color-status', 'success', `${tracks.length} piste(s), ${totalClips} clip(s)`);
  } catch (err: any) {
    console.error('[COLOR] Load failed:', err);
    setErrorStatus('color-status', err.message);
  }
}

// ── Run correction ─────────────────────────────────────

async function handleCorrect(): Promise<void> {
  console.log(`[COLOR] handleCorrect clicked! selectedIndices=${[...selectedIndices]}`);
  if (selectedIndices.size === 0) {
    setErrorStatus('color-status', 'Sélectionnez au moins une piste');
    return;
  }

  try {
    const result = await runColorCorrection(
      [...selectedIndices],
      tracks,
      (progress) => {
        const pct = progress.current && progress.total
          ? ` (${progress.current}/${progress.total})`
          : '';
        setStatus('color-status', progress.stage === 'error' ? 'error' : 'loading', `${progress.message}${pct}`);
        console.log(`[COLOR] ${progress.stage}: ${progress.message}${pct}`);
      },
    );

    setStatus('color-status', 'success', `Terminé — ${result.mediaCount} média(s), ${result.clipCount} clip(s)`);
  } catch (err: any) {
    console.error('[COLOR] Correction failed:', err);
    setErrorStatus('color-status', err.message);
  }
}

// ── Mount ──────────────────────────────────────────────

export function mountColorHooks(): void {
  // Use event delegation on the tab panel — reliable in UXP for innerHTML-injected elements
  const panel = document.getElementById('tab-color');
  if (!panel) return;

  panel.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest?.('[id]') as HTMLElement | null;
    if (!target) return;

    if (target.id === 'btn-load-color') {
      handleLoad();
    } else if (target.id === 'btn-correct') {
      console.log('[COLOR] btn-correct click via delegation');
      handleCorrect();
    }
  });
}
