// Small pieces every screen uses: escaping, icons, the toast, the sheet that slides up,
// and one set of event handlers for whichever screen is showing.
import * as M from './model.js';

export const app = document.getElementById('app');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const W = n => `${Math.round(n).toLocaleString('en-US')}\u00a0W`;

export function go(path, replace = false) {
  const hash = '#' + path;
  if (replace) location.replace(hash); else location.hash = hash;
}

// Line icons, drawn in the text colour.
const P = {
  outlet: '<rect x="4.5" y="3" width="15" height="18" rx="4.5"/><path d="M9.5 8v3.2M14.5 8v3.2"/><path d="M10.4 17.2v-1a1.6 1.6 0 0 1 3.2 0v1z"/>',
  light: '<path d="M9.2 17.5h5.6M10.2 20.5h3.6"/><path d="M12 3.2a5.8 5.8 0 0 0-3.4 10.5c.6.5.9 1.1.9 1.8v.5h5v-.5c0-.7.3-1.3.9-1.8A5.8 5.8 0 0 0 12 3.2z"/>',
  switch: '<rect x="5.5" y="3" width="13" height="18" rx="2.5"/><rect x="9.6" y="6.8" width="4.8" height="10.4" rx="1.6"/><path d="M9.6 12h4.8"/>',
  appliance: '<path d="M9 3v5M15 3v5"/><path d="M6.5 8h11v3.2a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.7V21"/>',
  panel: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M12 2.5v19M7 7h2.6M14.4 7H17M7 11h2.6M14.4 11H17M7 15h2.6M14.4 15H17"/>',
  rooms: '<path d="M3.5 11.2 12 4.5l8.5 6.7"/><path d="M5.8 9.6V20h12.4V9.6"/><path d="M10 20v-5.5h4V20"/>',
  map: '<path d="M13.2 2.5 5.5 13.2h5.6l-1.3 8.3 8.7-11.2h-5.8z"/>',
  loads: '<path d="M3.8 17.5a8.2 8.2 0 1 1 16.4 0"/><path d="m12 17.5 4.2-5.4"/><path d="M6.3 11.2l1.3.9M12 6.9V8.4M17.7 11.2l-1.3.9"/>',
  print: '<path d="M7 8.5V3h10v5.5"/><path d="M7 17H4.5v-7.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1V17H17"/><path d="M7 13.5h10V21H7z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 5 5"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9.5 21 2.5-6 2.5 2V21M8 11.5l2-3.5 4 1 2.5 3.5M12 8l-.9 5 2.9 2"/>',
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7.5h14V12"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;

export const KIND_LABEL = { outlet: 'Outlet', light: 'Light', switch: 'Switch', appliance: 'Appliance' };

// A breaker number in a little black handle, as it appears next to things.
export function badge(house, circuitId, extra = '') {
  const c = circuitId && M.findCircuit(house, circuitId);
  if (!c) return `<span class="bno none ${extra}" title="Not found yet">?</span>`;
  return `<span class="bno ${extra}">${numHTML(house, c)}</span>`;
}
// A breaker's number, with its panel's first word in small type when it isn't in the main panel.
export function numHTML(house, c) {
  const p = M.panelOf(house, c);
  return `${house.panels.length > 1 && p !== house.panels[0] ? `<small>${esc(shortPanel(p))}</small>` : ''}${M.circuitName(c)}`;
}
export const shortPanel = p => (p.name.split(/\s+/)[0] || 'Sub').slice(0, 8);

export const roomDot = room => `<i class="rdot" style="--rc:var(--r${room?.color ?? 0})" aria-hidden="true"></i>`;

// One set of listeners on the page; each screen says what they do.
let handlers = {};
export function on(h) { handlers = h; }
for (const type of ['click', 'input', 'change', 'keydown', 'submit']) {
  app.addEventListener(type, e => handlers[type]?.(e));
}

let toastTimer;
export function toast(message, action) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  if (action) el.querySelector('button').onclick = () => { el.hidden = true; action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2800);
}

// The sheet that slides up from the bottom. bind() wires up what's inside once it's drawn.
let onClose = null;
export function sheet(html, bind, closed) {
  const dlg = document.getElementById('sheet');
  // A fresh body each time, so listeners from the last sheet don't linger.
  const body = document.createElement('div');
  body.className = 'sheet-body';
  dlg.querySelector('.sheet-body').replaceWith(body);
  body.innerHTML = `<button type="button" class="sheet-x" data-close aria-label="Close">${icon('close')}</button>${html}`;
  onClose = closed || null;
  if (!dlg.open) {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  body.scrollTop = 0;
  const close = () => { if (dlg.open) { dlg.close?.(); dlg.removeAttribute('open'); } };
  body.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  bind?.(body, close);
}
// Closes the sheet without running what it would do on closing, for when the page is moving elsewhere.
export function dropSheet() {
  onClose = null;
  const dlg = document.getElementById('sheet');
  if (dlg.open) { dlg.close?.(); dlg.removeAttribute('open'); }
}
{
  const dlg = document.getElementById('sheet');
  dlg.addEventListener('close', () => { const f = onClose; onClose = null; f?.(); });
  // Tap outside the sheet to close it.
  dlg.addEventListener('click', e => { if (e.target === dlg) { dlg.close?.(); dlg.removeAttribute('open'); } });
}

// Buttons in a row where one is chosen, like amps or kind.
export const choices = (name, list, current, fmt = x => x) => `<div class="seg" role="radiogroup" data-name="${name}">${list.map(v => `
  <button type="button" role="radio" aria-checked="${String(v) === String(current)}" data-v="${esc(v)}">${fmt(v)}</button>`).join('')}</div>`;

export function bindChoices(root, name, pick) {
  const group = root.querySelector(`.seg[data-name="${name}"]`);
  group?.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    group.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    pick(b.dataset.v);
  });
}

export async function copy(text, field) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Link copied');
  } catch {
    // Some browsers and embedded views refuse the clipboard: select the link so it can be copied by hand.
    field?.focus();
    field?.select();
    let done = false;
    try { done = document.execCommand('copy'); } catch { /* not allowed here either */ }
    toast(done ? 'Link copied' : 'The link is selected. Copy it from there.');
  }
}

// The one-file copy shown inside another page can't start a download.
export function canSave() {
  if (!('single' in document.documentElement.dataset)) return true;
  try { return window.top === window.self; } catch { return false; }
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const when = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
