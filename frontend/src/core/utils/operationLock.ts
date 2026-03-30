/**
 * Global operation lock — prevents concurrent PPro transactions that cause crashes.
 * When acquired, disables all `.btn--primary` buttons. When released, restores them.
 */

let _locked = false;
let _feature: string | null = null;

export function acquireLock(feature: string): boolean {
  if (_locked) return false;
  _locked = true;
  _feature = feature;
  document.querySelectorAll<HTMLElement>('.btn--primary').forEach(btn => {
    btn.classList.add('btn--disabled');
    btn.dataset.lockedByGlobal = '1';
  });
  return true;
}

export function releaseLock(): void {
  if (!_locked) return;
  _locked = false;
  _feature = null;
  document.querySelectorAll<HTMLElement>('.btn--primary[data-locked-by-global]').forEach(btn => {
    btn.classList.remove('btn--disabled');
    delete btn.dataset.lockedByGlobal;
  });
}

export function isLocked(): boolean {
  return _locked;
}

export function currentFeature(): string | null {
  return _feature;
}
