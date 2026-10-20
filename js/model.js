// The house and the arithmetic: panels and their spaces, breakers, rooms and the things in them,
// load checks, the labels the directory prints, mapping progress and the two mapping workflows.
// No page code, so the unit tests run it in Node.
//
// A house:   { id, name, panels: [Panel], rooms: [Room], things: [Thing], session }
// A panel:   { id, name, spaces, mainAmps, where, fedBy, circuits: [Circuit] }
//            spaces are numbered the usual US way: odd numbers down the left, even down the right,
//            so spaces 1 and 2 share the top row. fedBy is the id of the breaker that feeds a subpanel.
// A circuit: { id, space, poles, half, amps, kind, label, tested }
//            one handle you can flip. A double-pole breaker (poles 2) takes its space and the one below it
//            (7 and 9). A tandem breaker is two circuits in one space, half 'A' and half 'B'.
// A room:    { id, name, color }
// A thing:   { id, roomId, kind, name, watts, volts, hours, circuitId }
//            kind is outlet, light, switch or appliance. hours: it runs for three hours or more at a time.

export const AMPS = [15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
export const MAIN_AMPS = [60, 100, 125, 150, 200, 225, 320, 400];
export const SPACE_COUNTS = [12, 16, 20, 24, 30, 32, 40, 42];
export const BREAKER_KINDS = {
  standard: 'Standard',
  gfci: 'GFCI',
  afci: 'AFCI',
  dual: 'Dual function',
};
export const THING_KINDS = ['outlet', 'light', 'switch', 'appliance'];
export const ROOM_COLORS = 12;
export const CONTINUOUS = 0.8; // the 80% guideline for loads that run for hours

export const newId = (prefix = '') => prefix + Math.random().toString(36).slice(2, 10);
const now = () => Date.now();

// ---------- Houses and panels ----------

export function blankHouse(name = 'My house') {
  return { id: newId('h'), name, created: now(), updated: now(), panels: [], rooms: [], things: [], session: null };
}

export function evenSpaces(n) {
  const v = Math.round(Number(n) || 0);
  return Math.min(84, Math.max(2, v + (v % 2)));
}

export function makeCircuit(space, { poles = 1, half = null, amps = 15, kind = 'standard', label = '' } = {}) {
  return { id: newId('c'), space, poles, half, amps, kind, label, tested: 0 };
}

// fill: put a single-pole breaker of that many amps in every space, which is how most panels look.
export function addPanel(house, { name, spaces = 40, mainAmps = 200, where = '', fill = 15, fedBy = null } = {}) {
  const panel = {
    id: newId('p'),
    name: name || (house.panels.length ? 'Subpanel' : 'Main panel'),
    spaces: evenSpaces(spaces),
    mainAmps: mainAmps || null,
    where,
    fedBy,
    circuits: [],
  };
  if (fill) for (let s = 1; s <= panel.spaces; s++) panel.circuits.push(makeCircuit(s, { amps: fill }));
  house.panels.push(panel);
  return panel;
}

// Changing the number of spaces drops breakers that no longer fit; things on them become unmapped.
export function resizePanel(house, panel, spaces) {
  panel.spaces = evenSpaces(spaces);
  const gone = outside(panel, panel.spaces);
  gone.forEach(c => removeCircuit(house, c));
  return gone;
}

const outside = (panel, spaces) => panel.circuits.filter(c => spacesOf(c).some(s => s > spaces));

// What a panel cut to that many spaces would lose that something is known about: breakers with things on them,
// feeding a subpanel, flip-tested, or with a label of your own. Making the panel smaller asks first.
export const atRisk = (house, panel, spaces) => outside(panel, evenSpaces(spaces)).filter(c => isMapped(house, c) || c.label.trim());

export function removePanel(house, panel) {
  [...panel.circuits].forEach(c => removeCircuit(house, c));
  house.panels = house.panels.filter(p => p !== panel);
  for (const p of house.panels) if (p.fedBy && !findCircuit(house, p.fedBy)) p.fedBy = null;
}

// ---------- Circuits ----------

export const volts = c => (c.poles === 2 ? 240 : 120);
export const capacity = c => volts(c) * c.amps;
export const spacesOf = c => (c.poles === 2 ? [c.space, c.space + 2] : [c.space]);
export const rowOf = space => Math.ceil(space / 2) - 1;
export const sideOf = space => (space % 2 ? 'left' : 'right');

export function circuitName(c) {
  if (c.poles === 2) return `${c.space}/${c.space + 2}`;
  return c.half ? `${c.space}${c.half}` : String(c.space);
}

export const byPosition = (a, b) => a.space - b.space || String(a.half || '').localeCompare(String(b.half || ''));

export function allCircuits(house) {
  return house.panels.flatMap(p => [...p.circuits].sort(byPosition));
}

export function findCircuit(house, id) {
  for (const p of house.panels) {
    const c = p.circuits.find(x => x.id === id);
    if (c) return c;
  }
  return null;
}

export const panelOf = (house, c) => house.panels.find(p => p.circuits.includes(c)) || null;

// Space number → the circuits in it (a tandem space has two; a double-pole shows up in both of its spaces).
export function occupancy(panel) {
  const map = new Map();
  for (const c of panel.circuits) {
    for (const s of spacesOf(c)) {
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(c);
    }
  }
  for (const list of map.values()) list.sort(byPosition);
  return map;
}

// Why a breaker can't go there, or '' if it can. ignore: circuits to leave out of the check (the one being changed).
export function placeProblem(panel, space, poles = 1, half = null, ignore = []) {
  if (!Number.isInteger(space) || space < 1 || space > panel.spaces) return `This panel has spaces 1 to ${panel.spaces}.`;
  if (poles === 2 && space + 2 > panel.spaces) return `A double-pole breaker needs space ${space + 2} below it, and this panel stops at ${panel.spaces}.`;
  const occ = occupancy(panel);
  const want = poles === 2 ? [space, space + 2] : [space];
  for (const s of want) {
    const there = (occ.get(s) || []).filter(c => !ignore.includes(c));
    if (!there.length) continue;
    const tandemOK = half && poles === 1 && there.every(c => c.half && c.half !== half && c.poles === 1 && c.space === s);
    if (!tandemOK) return `Space ${s} already has a breaker in it.`;
  }
  return '';
}

export function addCircuit(panel, space, opts = {}) {
  const problem = placeProblem(panel, space, opts.poles || 1, opts.half || null);
  if (problem) throw new Error(problem);
  const c = makeCircuit(space, opts);
  panel.circuits.push(c);
  panel.circuits.sort(byPosition);
  return c;
}

export const thingsOn = (house, circuitId) => house.things.filter(t => t.circuitId === circuitId);
export const feedsPanel = (house, c) => house.panels.find(p => p.fedBy === c.id) || null;

export function removeCircuit(house, c) {
  const panel = panelOf(house, c);
  if (!panel) return;
  for (const t of thingsOn(house, c.id)) t.circuitId = null;
  if (c.half) {
    const partner = panel.circuits.find(x => x !== c && x.space === c.space && x.half);
    if (partner) partner.half = null;
  }
  for (const p of house.panels) if (p.fedBy === c.id) p.fedBy = null;
  panel.circuits = panel.circuits.filter(x => x !== c);
  leaveSession(house, c.id);
}

// A mapping session can't point at a breaker that's gone: flip-testing it stops, and a search drops it from the
// ones tried and, if it was found there, goes back to trying the rest. into: where its things went instead.
function leaveSession(house, id, into = null) {
  const s = house.session;
  if (s?.mode === 'flip' && s.circuit === id) house.session = null;
  if (s?.mode !== 'find') return;
  s.tried = s.tried.filter(x => x !== id);
  if (s.found !== id) return;
  s.found = into;
  if (!into) s.step = 'try';
}

// Single pole (120 V) or double pole (240 V). A double-pole breaker takes the space below its own.
// Returns { ok, error, removed }: an empty breaker already in that space is taken out to make room;
// one with things on it is left alone and the change is refused.
export function setPoles(house, c, poles) {
  const panel = panelOf(house, c);
  if (c.poles === poles) return { ok: true, removed: [] };
  if (poles === 1) {
    c.poles = 1;
    return { ok: true, removed: [] };
  }
  const problem = doubleProblem(house, c);
  if (problem) return { ok: false, error: problem, removed: [] };
  const partner = c.half ? panel.circuits.find(x => x !== c && x.space === c.space && x.half) : null;
  if (partner && busy(house, partner)) return { ok: false, error: busyText(partner), removed: [] };
  const inTheWay = [...new Set([...(occupancy(panel).get(c.space + 2) || []), ...(partner ? [partner] : [])])];
  inTheWay.forEach(x => removeCircuit(house, x));
  c.half = null;
  c.poles = 2;
  return { ok: true, removed: inTheWay };
}

const busy = (house, c) => thingsOn(house, c.id).length || feedsPanel(house, c);
const busyText = c => `Breaker ${circuitName(c)} has things on it. Move them, or remove that breaker first.`;

// Why a breaker can't be made double-pole, or '' if it can: it needs the space below, with nothing mapped there.
// A tandem's other half doesn't count; the breaker sheet folds it in first, once it knows the change will go through.
export function doubleProblem(house, c) {
  const panel = panelOf(house, c);
  if (c.space + 2 > panel.spaces) return `There’s no space below ${c.space} for the second pole.`;
  const there = (occupancy(panel).get(c.space + 2) || []).find(x => x !== c && busy(house, x));
  return there ? busyText(there) : '';
}

// Tandem: two circuits in one space. Turning it on adds a B half; turning it off moves B's things onto A.
export function setTandem(house, c, on) {
  const panel = panelOf(house, c);
  if (on) {
    if (c.half) return { ok: true, partner: panel.circuits.find(x => x !== c && x.space === c.space && x.half) };
    if (c.poles === 2) c.poles = 1;
    c.half = 'A';
    const partner = makeCircuit(c.space, { half: 'B', amps: Math.min(c.amps, 20) });
    panel.circuits.push(partner);
    panel.circuits.sort(byPosition);
    return { ok: true, partner };
  }
  if (!c.half) return { ok: true, moved: 0 };
  const partner = panel.circuits.find(x => x !== c && x.space === c.space && x.half);
  let moved = 0;
  if (partner) {
    for (const t of thingsOn(house, partner.id)) { t.circuitId = c.id; moved++; }
    for (const p of house.panels) if (p.fedBy === partner.id) p.fedBy = c.id;
    panel.circuits = panel.circuits.filter(x => x !== partner);
    leaveSession(house, partner.id, c.id);
  }
  c.half = null;
  return { ok: true, moved };
}

// The panel as rows, the way it looks with the door open: each row has a left cell (odd space) and a right cell (even).
// A cell lists the circuits that start there; `under` is a double-pole breaker from the row above reaching into it.
export function rowsOf(panel) {
  const rows = [];
  for (let r = 0; r < panel.spaces / 2; r++) {
    const row = {};
    for (const [side, space] of [['left', 2 * r + 1], ['right', 2 * r + 2]]) {
      const starts = panel.circuits.filter(c => c.space === space).sort(byPosition);
      const under = panel.circuits.find(c => c.poles === 2 && c.space + 2 === space) || null;
      row[side] = { space, circuits: starts, under };
    }
    rows.push(row);
  }
  return rows;
}

// Puts a single-pole breaker in every empty space.
export function fillEmpty(panel, amps = 15) {
  return emptySpaces(panel).map(s => addCircuit(panel, s, { amps }));
}

export const emptySpaces = panel => {
  const occ = occupancy(panel);
  const out = [];
  for (let s = 1; s <= panel.spaces; s++) if (!occ.has(s)) out.push(s);
  return out;
};

// ---------- Rooms and things ----------

export function addRoom(house, name) {
  // The least-used colour, first in order on a tie.
  const counts = Array.from({ length: ROOM_COLORS }, (_, i) => house.rooms.filter(r => r.color === i).length);
  const color = counts.indexOf(Math.min(...counts));
  const room = { id: newId('r'), name: String(name || 'Room').trim() || 'Room', color };
  house.rooms.push(room);
  return room;
}

export function removeRoom(house, room) {
  house.rooms = house.rooms.filter(r => r !== room);
  house.things = house.things.filter(t => t.roomId !== room.id);
}

export const thingsIn = (house, roomId) => house.things.filter(t => t.roomId === roomId);
export const roomOf = (house, thing) => house.rooms.find(r => r.id === thing.roomId) || null;
export const findThing = (house, id) => house.things.find(t => t.id === id) || null;

const GENERIC = /^(outlet|light|switch|lights|outlets|switches)\s*\d*$/i;
export const isGeneric = t => GENERIC.test(t.name.trim()) || !t.name.trim();

// A new outlet, light or switch is called "Outlet 3", counting what's already in the room.
export function nextName(house, roomId, kind) {
  const word = { outlet: 'Outlet', light: 'Light', switch: 'Switch', appliance: 'Appliance' }[kind];
  const taken = new Set(thingsIn(house, roomId).map(t => t.name.trim().toLowerCase()));
  for (let i = 1; ; i++) if (!taken.has(`${word} ${i}`.toLowerCase())) return `${word} ${i}`;
}

export function addThing(house, roomId, { kind = 'outlet', name, watts = null, volts = 120, hours = false, circuitId = null } = {}) {
  const t = {
    id: newId('t'),
    roomId,
    kind,
    name: String(name ?? '').trim() || nextName(house, roomId, kind),
    watts: watts > 0 ? Math.round(watts) : null,
    volts: volts === 240 ? 240 : 120,
    hours: !!hours,
    circuitId,
  };
  house.things.push(t);
  return t;
}

export const removeThing = (house, thing) => { house.things = house.things.filter(t => t !== thing); };

// ---------- Loads ----------

// What's known to be on a circuit, against what the breaker carries (volts × amps) and the 80% guideline.
//   over:  everything listed adds up to more than the breaker carries, so running it all at once will likely trip it.
//   tight: things that run for hours are over 80%, or everything together is over 80%.
//   ok, or unknown when no watts are known.
export function loadOf(house, c, seen = new Set()) {
  seen.add(c.id);
  const items = thingsOn(house, c.id).filter(t => t.watts > 0).map(t => ({ thing: t, watts: t.watts, hours: t.hours }));
  let total = items.reduce((s, i) => s + i.watts, 0);
  let hours = items.filter(i => i.hours).reduce((s, i) => s + i.watts, 0);
  const sub = feedsPanel(house, c);
  let subTotal = 0, subHours = 0;
  if (sub) {
    for (const sc of sub.circuits) {
      if (seen.has(sc.id)) continue;
      const l = loadOf(house, sc, seen);
      subTotal += l.total;
      subHours += l.hours;
    }
    total += subTotal;
    hours += subHours;
  }
  const cap = capacity(c);
  const limit = Math.round(cap * CONTINUOUS);
  let status = 'ok', why = null;
  if (!total) status = 'unknown';
  else if (total > cap) { status = 'over'; why = 'total'; }
  else if (hours > limit) { status = 'tight'; why = 'hours'; }
  else if (total > limit) { status = 'tight'; why = 'total'; }
  const needs240 = c.poles === 1 ? thingsOn(house, c.id).filter(t => t.volts === 240) : [];
  return { circuit: c, items, total, hours, capacity: cap, limit, share: cap ? total / cap : 0, status, why, sub, subTotal, subHours, needs240 };
}

const RANK = { over: 0, tight: 1, ok: 2, unknown: 3 };
export function loadReport(house) {
  return allCircuits(house)
    .map(c => loadOf(house, c))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.share - a.share);
}

// ---------- Labels ----------

const lowerFirst = s => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const plural = { outlet: 'outlets', light: 'lights', switch: 'switches' };

function describe(things) {
  const bits = [];
  for (const kind of ['outlet', 'light', 'appliance', 'switch']) {
    const mine = things.filter(t => t.kind === kind);
    if (!mine.length) continue;
    if (kind === 'switch' && things.length > mine.length) continue; // a switch goes without saying next to its light
    if (kind === 'appliance') { bits.push(...mine.map(t => lowerFirst(t.name.trim()))); continue; }
    const named = mine.filter(t => !isGeneric(t));
    if (named.length === mine.length && named.length <= 2) bits.push(...named.map(t => lowerFirst(t.name.trim())));
    else bits.push(mine.length > 1 ? plural[kind] : kind);
  }
  return bits.join(', ');
}

// Written from what's on it: "Kitchen counter left, dishwasher", or just "Bedroom 2" when it's the whole room.
export function autoLabel(house, c) {
  const things = thingsOn(house, c.id);
  const parts = [];
  const sub = feedsPanel(house, c);
  if (sub) parts.push(sub.name);
  for (const room of house.rooms) {
    const mine = things.filter(t => t.roomId === room.id);
    if (!mine.length) continue;
    const all = thingsIn(house, room.id);
    if (mine.length === all.length && all.length > 1) parts.push(room.name);
    else parts.push(`${room.name} ${describe(mine)}`.trim());
  }
  return parts.join('; ');
}

export const labelOf = (house, c) => (c.label || '').trim() || autoLabel(house, c);

// Rooms a circuit reaches, most things first, for its colour on the panel.
export function roomsOn(house, c) {
  const counts = new Map();
  for (const t of thingsOn(house, c.id)) counts.set(t.roomId, (counts.get(t.roomId) || 0) + 1);
  return house.rooms.filter(r => counts.has(r.id)).sort((a, b) => counts.get(b.id) - counts.get(a.id));
}

// ---------- Progress ----------

export const isMapped = (house, c) => !!c.tested || thingsOn(house, c.id).length > 0 || !!feedsPanel(house, c);

export function progress(house) {
  const circuits = allCircuits(house);
  const mapped = circuits.filter(c => isMapped(house, c)).length;
  const found = house.things.filter(t => t.circuitId && findCircuit(house, t.circuitId)).length;
  return {
    circuits: circuits.length,
    mapped,
    tested: circuits.filter(c => c.tested).length,
    things: house.things.length,
    found,
    unfound: house.things.length - found,
  };
}

// The next breaker to flip-test, in panel order after `after`: one with nothing known first,
// then one that has things but hasn't had a full walk-round. Breakers feeding a subpanel are skipped.
export function nextToTest(house, after = null) {
  const list = allCircuits(house).filter(c => !feedsPanel(house, c));
  const start = after ? list.findIndex(c => c.id === after) + 1 : 0;
  const ordered = [...list.slice(start), ...list.slice(0, start)].filter(c => c.id !== after);
  return ordered.find(c => !isMapped(house, c)) || ordered.find(c => !c.tested) || null;
}

// ---------- Mapping: flip a breaker off and tap what went dead ----------
// house.session = { mode: 'flip', circuit, step: 'off' | 'walk' | 'on', was: { thingId: circuit it was on before } }

export function startFlip(house, circuitId) {
  house.session = { mode: 'flip', circuit: circuitId, step: 'off', was: {} };
  return house.session;
}

// Tapping a thing marks it dead (on this breaker); tapping it again puts it back where it was.
export function toggleDead(house, thingId) {
  const s = house.session;
  const t = findThing(house, thingId);
  if (!s || s.mode !== 'flip' || !t) return false;
  if (t.circuitId === s.circuit) {
    t.circuitId = Object.hasOwn(s.was, thingId) ? s.was[thingId] : null;
    delete s.was[thingId];
    return false;
  }
  if (!Object.hasOwn(s.was, thingId)) s.was[thingId] = t.circuitId ?? null;
  t.circuitId = s.circuit;
  return true;
}

// Something found while walking round, dead: add it straight onto the breaker being tested.
export function addDeadThing(house, roomId, opts) {
  const s = house.session;
  const t = addThing(house, roomId, { ...opts, circuitId: s?.mode === 'flip' ? s.circuit : null });
  if (s?.mode === 'flip') s.was[t.id] = null;
  return t;
}

export function finishFlip(house) {
  const s = house.session;
  const c = s && findCircuit(house, s.circuit);
  if (!c) return null;
  c.tested = now();
  s.step = 'on';
  return c;
}

// Stop without finishing: what was tapped stays tapped.
export const stopSession = house => { house.session = null; };

// ---------- Mapping: find which breaker one thing is on ----------
// house.session = { mode: 'find', thing, tried: [circuit ids], step: 'try' | 'found', found }

// Breakers worth trying first: ones already feeding the same room, ones not yet walked round,
// and the right kind (double-pole for 240 V appliances, single-pole for everything else).
export function candidates(house, thingId) {
  const t = findThing(house, thingId);
  if (!t) return [];
  const list = allCircuits(house).filter(c => !feedsPanel(house, c));
  const score = c => {
    let s = 0;
    const right = t.volts === 240 ? c.poles === 2 : c.poles === 1;
    if (right) s += 10;
    if (thingsOn(house, c.id).some(x => x.roomId === t.roomId && x.id !== t.id)) s += 4;
    if (!c.tested) s += 2; else s -= 3; // a walked-round breaker would have found it already
    if (t.kind === 'light' && c.amps === 15) s += 1;
    if (t.kind === 'appliance' && t.watts >= 1000 && c.amps >= 20) s += 1;
    return s;
  };
  return list.map((c, i) => ({ c, s: score(c), i })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.c);
}

export function startFind(house, thingId) {
  house.session = { mode: 'find', thing: thingId, tried: [], step: 'try', found: null };
  return house.session;
}

export function currentTry(house) {
  const s = house.session;
  if (!s || s.mode !== 'find') return null;
  return candidates(house, s.thing).find(c => !s.tried.includes(c.id)) || null;
}

export function stillOn(house, circuitId) {
  const s = house.session;
  if (s?.mode === 'find' && !s.tried.includes(circuitId)) s.tried.push(circuitId);
}

export function wentOff(house, circuitId) {
  const s = house.session;
  const t = s && findThing(house, s.thing);
  if (!t) return null;
  t.circuitId = circuitId;
  s.step = 'found';
  s.found = circuitId;
  return findCircuit(house, circuitId);
}

// ---------- Search ----------

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/ ]+/g, ' ');

// "kitchen island" → the island outlet and its breaker. "12" → breaker 12 and what's on it.
export function search(house, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { things: [], circuits: [] };
  const numbers = words.filter(w => /^\d+$/.test(w)).map(Number);
  const text = words.filter(w => !/^\d+$/.test(w));
  // Other names for a kind of thing, which a word finds only from their start: "rec" finds every outlet, "ac" doesn't.
  const kindWord = { outlet: 'outlet plug socket receptacle', light: 'light lights lamp', switch: 'switch', appliance: 'appliance' };
  // A word finds the start of a word, or any part of one once it's three letters or more: "AC" and "TV" find
  // Central AC and the TV, not the space heater, the furnace or the outlet out the back.
  const hit = (hay, w) => hay.split(' ').some(h => h.startsWith(w)) || (w.length >= 3 && hay.includes(w));
  const starts = (hay, w) => hay.split(' ').some(h => h.startsWith(w));
  // A number is a breaker number, or part of a name like "Bedroom 2".
  const matches = (hay, extra = [], other = '') => text.every(w => hit(hay, w) || starts(other, w))
    && numbers.every(n => extra.includes(n) || hay.split(' ').includes(String(n)));
  const rank = new Map();
  const things = house.things.filter(t => {
    const c = t.circuitId && findCircuit(house, t.circuitId);
    const room = norm(roomOf(house, t)?.name);
    const name = norm(t.name);
    const hay = `${room} ${name} ${c ? norm(circuitName(c)) : ''}`;
    if (!matches(hay, c ? spacesOf(c) : [], kindWord[t.kind])) return false;
    // First a thing whose own name matches the whole search; then things in a room that does ("bedroom 2" before
    // Bedroom 1's outlet 2); then the rest, and last the ones only found by another name for their kind.
    rank.set(t, text.every(w => hit(name, w)) && numbers.every(n => name.split(' ').includes(String(n))) ? 0
      : words.every(w => starts(room, w)) ? 1
      : text.every(w => hit(hay, w)) ? 2 : 3);
    return true;
  });
  things.sort((a, b) => rank.get(a) - rank.get(b));
  // A breaker by its name, as the panel shows it ("28A", "5/7"), even with nothing known about it.
  const circuits = allCircuits(house).filter(c => {
    const name = norm(circuitName(c));
    const hay = norm(`breaker ${name} ${labelOf(house, c)} ${BREAKER_KINDS[c.kind]}`);
    return matches(hay, spacesOf(c)) && (numbers.length || text.length) && (numbers.length || labelOf(house, c) || text.some(w => name.startsWith(w)));
  });
  return { things, circuits };
}

// ---------- Housekeeping ----------

// Makes a house read from a backup or a link safe to use: known fields, sensible numbers, no dangling ids.
export function tidy(h) {
  const house = {
    id: String(h?.id || newId('h')),
    name: String(h?.name || 'My house').slice(0, 60),
    created: Number(h?.created) || now(),
    updated: Number(h?.updated) || now(),
    sample: !!h?.sample,
    panels: [],
    rooms: [],
    things: [],
    session: null,
  };
  for (const p of Array.isArray(h?.panels) ? h.panels : []) {
    const panel = {
      id: String(p.id || newId('p')),
      name: String(p.name || 'Panel').slice(0, 60),
      spaces: evenSpaces(p.spaces),
      mainAmps: Number(p.mainAmps) > 0 ? Math.round(p.mainAmps) : null,
      where: String(p.where || '').slice(0, 80),
      fedBy: p.fedBy ? String(p.fedBy) : null,
      circuits: [],
    };
    for (const c of Array.isArray(p.circuits) ? p.circuits : []) {
      const circuit = {
        id: String(c.id || newId('c')),
        space: Math.round(Number(c.space)),
        poles: c.poles === 2 ? 2 : 1,
        half: c.half === 'A' || c.half === 'B' ? c.half : null,
        amps: Number(c.amps) > 0 ? Math.round(c.amps) : 15,
        kind: BREAKER_KINDS[c.kind] ? c.kind : 'standard',
        label: String(c.label || '').slice(0, 80),
        tested: Number(c.tested) || 0,
      };
      if (circuit.poles === 2) circuit.half = null;
      if (!placeProblem(panel, circuit.space, circuit.poles, circuit.half)) panel.circuits.push(circuit);
    }
    panel.circuits.sort(byPosition);
    house.panels.push(panel);
  }
  const ids = new Set(house.panels.flatMap(p => p.circuits.map(c => c.id)));
  for (const p of house.panels) if (p.fedBy && !ids.has(p.fedBy)) p.fedBy = null;
  for (const r of Array.isArray(h?.rooms) ? h.rooms : []) {
    house.rooms.push({ id: String(r.id || newId('r')), name: String(r.name || 'Room').slice(0, 40), color: ((Number(r.color) || 0) % ROOM_COLORS + ROOM_COLORS) % ROOM_COLORS });
  }
  const roomIds = new Set(house.rooms.map(r => r.id));
  for (const t of Array.isArray(h?.things) ? h.things : []) {
    if (!roomIds.has(t.roomId)) continue;
    house.things.push({
      id: String(t.id || newId('t')),
      roomId: t.roomId,
      kind: THING_KINDS.includes(t.kind) ? t.kind : 'outlet',
      name: String(t.name || 'Outlet').slice(0, 60),
      watts: Number(t.watts) > 0 ? Math.round(t.watts) : null,
      volts: Number(t.volts) === 240 ? 240 : 120,
      hours: !!t.hours,
      circuitId: t.circuitId && ids.has(t.circuitId) ? t.circuitId : null,
    });
  }
  const s = h?.session;
  if (s?.mode === 'flip' && ids.has(s.circuit)) {
    house.session = { mode: 'flip', circuit: s.circuit, step: ['off', 'walk', 'on'].includes(s.step) ? s.step : 'off', was: typeof s.was === 'object' && s.was ? s.was : {} };
  } else if (s?.mode === 'find' && house.things.some(t => t.id === s.thing)) {
    const found = ids.has(s.found) ? s.found : null;
    house.session = { mode: 'find', thing: s.thing, tried: Array.isArray(s.tried) ? s.tried.filter(id => ids.has(id)) : [], step: s.step === 'found' && found ? 'found' : 'try', found };
  }
  return house;
}

export const watts = n => `${Math.round(n).toLocaleString('en-US')} W`;
