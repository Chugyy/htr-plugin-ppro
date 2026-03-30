import { BackendError, openInBrowser } from '@/core/api/backendAPI';
import { captureErrorReport } from '@/core/utils/bugReport';

let blinkTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Update a status indicator element. Supports optional action button
 * when the error is a BackendError with an actionUrl.
 */
export function setStatus(
  id: string,
  variant: 'neutral' | 'positive' | 'negative' | 'notice',
  text: string,
  error?: unknown,
): void {
  const container = document.getElementById(id);
  if (!container) return;
  const dot = container.querySelector('.status__dot') as HTMLElement | null;
  const label = container.querySelector('.status__text') as HTMLElement | null;

  // Stop any previous blink
  if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }

  // Remove any previous action button
  const oldBtn = container.querySelector('.status__action');
  if (oldBtn) oldBtn.remove();

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

  // Auto-send bug report on error
  if (variant === 'negative' && error) {
    const feature = id.replace(/-status$/, '') || 'unknown';
    captureErrorReport(feature, error);
  }

  // Add action button if error has an actionUrl
  if (error instanceof BackendError && error.actionUrl && error.actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'status__action';
    btn.textContent = error.actionLabel;
    btn.style.cssText = 'margin-left:8px;padding:2px 10px;font-size:10px;border-radius:6px;background:#214fcf;color:#fff;border:none;cursor:pointer;font-weight:600;';
    btn.addEventListener('click', () => openInBrowser(error.actionUrl!));
    container.appendChild(btn);
  }
}

/**
 * Convenience: extract message from any error and call setStatus with action support.
 * Bug report is auto-sent by setStatus when variant is 'negative'.
 */
export function setErrorStatus(id: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  setStatus(id, 'negative', message, err);
}
