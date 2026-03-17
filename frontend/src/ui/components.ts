/**
 * UI Components — Factory functions for styled elements.
 * Wrapper <div> is invisible (no bg, no border) — only provides margin/layout.
 * Native elements keep UXP's look but get proper spacing.
 */

const WRAPPER_STYLE = [
  'background:transparent',
  'border:none',
  'margin:6px 0',
].join(';');

// ── Input ───────────────────────────────────────────────────────────────────

export function createInput(opts: {
  id?: string;
  placeholder?: string;
  type?: string;
  value?: string;
}): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = WRAPPER_STYLE + ';flex:1';

  const el = document.createElement('input');
  el.type = opts.type ?? 'text';
  if (opts.id) el.id = opts.id;
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.value) el.value = opts.value;
  el.style.cssText = 'width:100%';

  wrapper.appendChild(el);
  return wrapper;
}

// ── Select ──────────────────────────────────────────────────────────────────

export function createSelect(opts: {
  id?: string;
  options: Array<{ value: string; label: string }>;
  selected?: string;
  disabled?: boolean;
}): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = WRAPPER_STYLE + ';margin:8px 0 4px';
  if (opts.disabled) wrapper.style.opacity = '0.35';

  const el = document.createElement('select');
  if (opts.id) el.id = opts.id;
  if (opts.disabled) el.disabled = true;
  el.style.cssText = 'width:100%';

  for (const opt of opts.options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    el.appendChild(o);
  }
  if (opts.selected) el.value = opts.selected;

  wrapper.appendChild(el);
  return wrapper;
}

// ── Textarea ────────────────────────────────────────────────────────────────

export function createTextarea(opts: {
  id?: string;
  placeholder?: string;
  value?: string;
}): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = WRAPPER_STYLE;

  const el = document.createElement('textarea');
  if (opts.id) el.id = opts.id;
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.value) el.value = opts.value;
  el.spellcheck = false;
  el.style.cssText = 'width:100%;min-height:120px;resize:none';

  wrapper.appendChild(el);
  return wrapper;
}
