// A read-only link to the map, for someone else in the house.
// Everything travels in the part of the link after #, which browsers never send to a server.
//
//   #/view/<data>   the panels, rooms and what's on each breaker, packed small

import { tidy, THING_KINDS, BREAKER_KINDS } from './model.js';

export const SITE = 'https://junkdrawer.works/breaker-box/';

// Where links should point: this page when it's the real site or a local copy, the real site otherwise
// (for example the single-file copy, which lives somewhere a link can't reach).
export function base(loc = globalThis.location) {
  if (!loc || !/^https?:$/.test(loc.protocol)) return SITE;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
  if (local || loc.hostname.endsWith('junkdrawer.works')) return loc.origin + loc.pathname;
  return SITE;
}

const toB64 = bytes => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));

async function squeeze(bytes, way) {
  const stream = new Blob([bytes]).stream().pipeThrough(way === 'in' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Squeezed when the browser can (z…), plain otherwise (j…).
export async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') {
    try { return 'z' + toB64(await squeeze(bytes, 'in')); } catch { /* fall through to plain */ }
  }
  return 'j' + toB64(bytes);
}

export async function unpack(text) {
  const kind = text[0];
  let bytes = fromB64(text.slice(1));
  if (kind === 'z') bytes = await squeeze(bytes, 'out');
  else if (kind !== 'j') throw new Error('not a Breaker Box link');
  return JSON.parse(new TextDecoder().decode(bytes));
}

const KINDS = Object.keys(BREAKER_KINDS);

// Short arrays and index numbers instead of ids keep the link as small as it can be.
export function compact(house, from = '') {
  const circuits = house.panels.flatMap(p => p.circuits);
  const ci = new Map(circuits.map((c, i) => [c.id, i]));
  const ri = new Map(house.rooms.map((r, i) => [r.id, i]));
  return {
    v: 1,
    n: house.name,
    f: from,
    t: house.updated,
    p: house.panels.map(p => [p.name, p.spaces, p.mainAmps || 0, p.where || '', p.fedBy ? ci.get(p.fedBy) : -1,
      p.circuits.map(c => [c.space, c.poles, c.half || '', c.amps, KINDS.indexOf(c.kind), c.label || '', c.tested ? 1 : 0])]),
    r: house.rooms.map(r => [r.name, r.color]),
    x: house.things.map(t => [ri.get(t.roomId), THING_KINDS.indexOf(t.kind), t.name, t.watts || 0, t.volts === 240 ? 1 : 0, t.hours ? 1 : 0, t.circuitId && ci.has(t.circuitId) ? ci.get(t.circuitId) : -1]),
  };
}

export function expand(p) {
  if (p?.v !== 1 || !Array.isArray(p.p) || !Array.isArray(p.r) || !Array.isArray(p.x)) throw new Error('not a map');
  let n = 0;
  const cid = [];
  const panels = p.p.map((row, pi) => {
    const [name, spaces, mainAmps, where, , circuits] = row;
    return {
      id: `p${pi}`, name, spaces, mainAmps, where, fedBy: null,
      circuits: (circuits || []).map(([space, poles, half, amps, kind, label, tested]) => {
        const id = `c${n++}`;
        cid.push(id);
        return { id, space, poles, half: half || null, amps, kind: KINDS[kind] || 'standard', label, tested: tested ? 1 : 0 };
      }),
    };
  });
  p.p.forEach((row, pi) => { if (row[4] >= 0 && cid[row[4]]) panels[pi].fedBy = cid[row[4]]; });
  const rooms = p.r.map(([name, color], i) => ({ id: `r${i}`, name, color }));
  const things = p.x.map(([room, kind, name, watts, v240, hours, circuit], i) => ({
    id: `t${i}`, roomId: `r${room}`, kind: THING_KINDS[kind] || 'outlet', name, watts, volts: v240 ? 240 : 120, hours: !!hours,
    circuitId: circuit >= 0 ? cid[circuit] || null : null,
  }));
  const house = tidy({ id: 'shared', name: p.n, updated: p.t, panels, rooms, things });
  return { house, from: String(p.f || '').slice(0, 40) };
}

export async function viewLink(house, from) {
  return `${base()}#/view/${await pack(compact(house, from))}`;
}

export async function readView(data) {
  return expand(await unpack(data));
}
