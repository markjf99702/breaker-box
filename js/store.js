// Saves the houses in this browser. Nothing leaves the device unless you share a link or save a backup.
import { tidy } from './model.js';

const KEY = 'breaker-box';

export function parse(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.houses)) throw new Error('not a backup');
  return data;
}

function read() {
  try {
    const data = parse(localStorage.getItem(KEY));
    return { houses: data.houses.map(tidy), current: data.current || null, name: String(data.name || '') };
  } catch { /* first visit, a private window, blocked storage or bad data: start empty */ }
  return { houses: [], current: null, name: '' };
}

let state = read();
let saved = true;
let watcher = null;
let failed = null;

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saved = true;
  } catch {
    saved = false; // can't save here; it still works for this visit
    failed?.();
  }
}

export const store = {
  get saved() { return saved; },
  houses: () => state.houses,
  house() {
    return state.houses.find(h => h.id === state.current) || state.houses[0] || null;
  },
  get: id => state.houses.find(h => h.id === id) || null,
  use(id) { state.current = id; write(); },
  // Saves the house after a change. Every change goes through here.
  put(h) {
    h.updated = Date.now();
    const i = state.houses.findIndex(x => x.id === h.id);
    if (i >= 0) state.houses[i] = h; else state.houses.push(h);
    if (!state.current || !state.houses.some(x => x.id === state.current)) state.current = h.id;
    write();
    watcher?.(h);
  },
  // What else to bring up to date after every change, such as the count on the Map it tab.
  watch(fn) { watcher = fn; },
  // What to do when the browser won't save a change (its storage is full, or blocked), such as saying so.
  onFail(fn) { failed = fn; },
  remove(id) {
    state.houses = state.houses.filter(h => h.id !== id);
    if (state.current === id) state.current = state.houses.find(h => !h.sample)?.id || state.houses[0]?.id || null;
    write();
  },
  get name() { return state.name; },
  set name(v) { state.name = String(v || '').slice(0, 40); write(); },
  backup: () => backupText(state),
  // Adds the houses from a backup; one that's already here is replaced if the backup's copy is newer.
  restore(text) {
    const { state: next, added } = merge(state, text);
    state = next;
    write();
    return added;
  },
  reset() { state = { houses: [], current: null, name: '' }; write(); },
};

export function backupText(s) {
  return JSON.stringify({ app: 'breaker-box', version: 1, saved: new Date().toISOString(), ...s, houses: s.houses.filter(h => !h.sample) }, null, 1);
}

// Pure, so the tests can check it: the state after loading a backup, and how many houses came in.
export function merge(current, text) {
  let data;
  try { data = parse(text); } catch { throw new Error('That file isn’t a Breaker Box backup.'); }
  if (data.app !== 'breaker-box') throw new Error('That file isn’t a Breaker Box backup.');
  const houses = [...current.houses];
  let added = 0;
  for (const raw of data.houses) {
    if (!raw?.id || !Array.isArray(raw.panels)) continue;
    const h = tidy(raw);
    const i = houses.findIndex(x => x.id === h.id);
    if (i < 0) { houses.push(h); added++; } else if (h.updated > houses[i].updated) { houses[i] = h; added++; }
  }
  const firstNew = data.houses.find(x => houses.some(h => h.id === x?.id))?.id;
  return {
    state: { ...current, houses, current: current.current && houses.some(h => h.id === current.current && !h.sample) ? current.current : firstNew || current.current, name: current.name || String(data.name || '') },
    added,
  };
}
