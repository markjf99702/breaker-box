// The data and the arithmetic, without a browser:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import * as M from '../js/model.js';
import { sampleHouse } from '../js/sample.js';
import { pack, unpack, compact, expand } from '../js/share.js';
import { merge, backupText } from '../js/store.js';
import { APPLIANCES, appliancesFor, findAppliance } from '../js/catalog.js';

// A house with one panel of `spaces`, every space holding a 15 A single-pole breaker.
function house(spaces = 20) {
  const h = M.blankHouse('Test');
  M.addPanel(h, { spaces, mainAmps: 100, fill: 15 });
  return h;
}
const at = (h, space, half = null) => h.panels[0].circuits.find(c => c.space === space && (c.half || null) === half);
const appliance = (h, roomId, name, extra = {}) => {
  const a = findAppliance(name);
  return M.addThing(h, roomId, { kind: 'appliance', name: a.name, watts: a.watts, volts: a.volts, hours: a.hours, ...extra });
};

test('spaces are numbered down the left in odd numbers and down the right in even', () => {
  const h = house(20);
  const p = h.panels[0];
  assert.equal(p.circuits.length, 20);
  const rows = M.rowsOf(p);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map(r => [r.left.space, r.right.space]).slice(0, 3), [[1, 2], [3, 4], [5, 6]]);
  assert.deepEqual(rows.at(-1).left.space, 19);
  assert.equal(M.sideOf(7), 'left');
  assert.equal(M.sideOf(8), 'right');
  assert.equal(M.rowOf(1), 0);
  assert.equal(M.rowOf(2), 0);
  assert.equal(M.rowOf(9), 4);
  assert.equal(M.evenSpaces(41), 42, 'an odd count rounds up to a whole row');
  assert.equal(M.evenSpaces(0), 2);
  assert.equal(M.emptySpaces(p).length, 0);
});

test('a double-pole breaker takes its space and the one below it', () => {
  const h = house(20);
  const p = h.panels[0];
  const c = at(h, 7);
  const r = M.setPoles(h, c, 2);
  assert.ok(r.ok);
  assert.equal(r.removed.length, 1, 'the empty breaker in 9 comes out');
  assert.equal(r.removed[0].space, 9);
  assert.equal(M.circuitName(c), '7/9');
  assert.deepEqual(M.spacesOf(c), [7, 9]);
  assert.equal(M.volts(c), 240);
  assert.equal(M.occupancy(p).get(9)[0], c);
  const row = M.rowsOf(p)[4];
  assert.equal(row.left.space, 9);
  assert.equal(row.left.circuits.length, 0);
  assert.equal(row.left.under, c, 'space 9 shows the lower half of 7/9');
  assert.match(M.placeProblem(p, 9), /already has a breaker/);
  assert.match(M.placeProblem(p, 5, 2), /Space 5 already/);
  M.removeCircuit(h, at(h, 5));
  assert.match(M.placeProblem(p, 5, 2), /Space 7 already/, 'a double-pole in 5 would need 7 as well');
  assert.equal(M.placeProblem(p, 9, 1, null, [c]), '', 'ignoring the breaker being changed');

  // Back to single pole: space 9 is empty again.
  M.setPoles(h, c, 1);
  assert.deepEqual(M.emptySpaces(p), [5, 9]);
  const added = M.fillEmpty(p, 20);
  assert.deepEqual(added.map(x => x.space), [5, 9]);
  assert.equal(added[0].amps, 20);
});

test('a double-pole breaker is refused where it would not fit or would drop something mapped', () => {
  const h = house(20);
  const room = M.addRoom(h, 'Laundry');
  const washer = M.addThing(h, room.id, { kind: 'appliance', name: 'Washer', circuitId: at(h, 11).id });
  const r = M.setPoles(h, at(h, 9), 2);
  assert.equal(r.ok, false);
  assert.match(r.error, /Breaker 11 has things on it/);
  assert.equal(at(h, 9).poles, 1);
  assert.equal(washer.circuitId, at(h, 11).id, 'nothing was moved');
  const bottom = M.setPoles(h, at(h, 19), 2);
  assert.equal(bottom.ok, false);
  assert.match(bottom.error, /no space below 19/);
  assert.throws(() => M.addCircuit(h.panels[0], 3), /Space 3 already/);
  assert.throws(() => M.addCircuit(h.panels[0], 21), /spaces 1 to 20/);
});

test('a tandem is two circuits in one space', () => {
  const h = house(12);
  const p = h.panels[0];
  const c = at(h, 6);
  const { partner } = M.setTandem(h, c, true);
  assert.equal(M.circuitName(c), '6A');
  assert.equal(M.circuitName(partner), '6B');
  assert.equal(M.occupancy(p).get(6).length, 2);
  assert.equal(M.placeProblem(p, 6, 1, 'B', [partner]), '');
  assert.equal(M.rowsOf(p)[2].right.circuits.length, 2);
  const room = M.addRoom(h, 'Hall');
  const light = M.addThing(h, room.id, { kind: 'light', circuitId: partner.id });
  const off = M.setTandem(h, c, false);
  assert.equal(off.moved, 1);
  assert.equal(light.circuitId, c.id, 'B’s things move onto the one left');
  assert.equal(M.circuitName(c), '6');
  assert.equal(M.occupancy(p).get(6).length, 1);

  // A tandem made double-pole loses its (empty) B half.
  M.setTandem(h, c, true);
  const r = M.setPoles(h, c, 2);
  assert.ok(r.ok);
  assert.equal(c.half, null);
  assert.equal(M.circuitName(c), '6/8');
});

test('removing a breaker or shrinking the panel leaves its things unmapped', () => {
  const h = house(20);
  const room = M.addRoom(h, 'Kitchen');
  const fridge = appliance(h, room.id, 'Fridge', { circuitId: at(h, 4).id });
  M.removeCircuit(h, at(h, 4));
  assert.equal(fridge.circuitId, null);
  assert.deepEqual(M.emptySpaces(h.panels[0]), [4]);
  const dryer = appliance(h, room.id, 'Electric dryer', { circuitId: at(h, 17).id });
  M.setPoles(h, at(h, 17), 2); // 17/19
  const gone = M.resizePanel(h, h.panels[0], 16);
  assert.deepEqual(gone.map(M.circuitName).sort(), ['17/19', '18', '20'], 'what no longer fits comes out');
  assert.equal(dryer.circuitId, null);
  assert.equal(h.panels[0].spaces, 16);
});

test('the load check: volts × amps, and the 80% guideline for things that run for hours', () => {
  const h = house(20);
  const room = M.addRoom(h, 'Office');
  const c = at(h, 11); // 15 A, 120 V
  assert.equal(M.capacity(c), 1800);
  assert.equal(M.loadOf(h, c).status, 'unknown');

  const heater = appliance(h, room.id, 'Space heater', { circuitId: c.id }); // 1500 W, runs for hours
  let l = M.loadOf(h, c);
  assert.equal(l.total, 1500);
  assert.equal(l.limit, 1440);
  assert.equal(l.status, 'tight', 'a heater on its own is over 80% of a 15 A circuit');
  assert.equal(l.why, 'hours');

  appliance(h, room.id, 'Microwave', { circuitId: c.id });
  l = M.loadOf(h, c);
  assert.equal(l.total, 3000);
  assert.equal(l.status, 'over', 'a heater and a microwave on one 15 A circuit will likely trip it');
  assert.equal(l.items.length, 2);

  c.amps = 20; // 2,400 W
  assert.equal(M.loadOf(h, c).status, 'over');
  heater.circuitId = null;
  l = M.loadOf(h, c);
  assert.equal(l.total, 1500);
  assert.equal(l.status, 'ok', '1,500 W of 2,400 W is fine');
  c.amps = 15;
  l = M.loadOf(h, c);
  assert.equal(l.status, 'tight', 'over 80% even when nothing runs for hours');
  assert.equal(l.why, 'total');

  // 240 V: a 30 A double-pole carries 7,200 W.
  const d = at(h, 5);
  M.setPoles(h, d, 2);
  d.amps = 30;
  assert.equal(M.capacity(d), 7200);
  appliance(h, room.id, 'Water heater', { circuitId: d.id }); // 4,500 W, runs for hours
  l = M.loadOf(h, d);
  assert.equal(l.status, 'ok');
  assert.ok(Math.abs(l.share - 0.625) < 1e-9);

  // A 240 V appliance on a single-pole breaker gets a note.
  appliance(h, room.id, 'Electric dryer', { circuitId: at(h, 2).id });
  assert.equal(M.loadOf(h, at(h, 2)).needs240.length, 1);

  const report = M.loadReport(h);
  assert.equal(report[0].status, 'over', 'the report puts the worst first');
});

test('a breaker feeding a subpanel carries everything on it', () => {
  const h = house(20);
  const feeder = at(h, 17);
  M.setPoles(h, feeder, 2);
  feeder.amps = 60;
  const sub = M.addPanel(h, { name: 'Garage subpanel', spaces: 8, mainAmps: null, fill: 20, fedBy: feeder.id });
  const garage = M.addRoom(h, 'Garage');
  const ev = sub.circuits.find(c => c.space === 1);
  M.setPoles(h, ev, 2);
  ev.amps = 40;
  appliance(h, garage.id, 'EV charger', { circuitId: ev.id });
  appliance(h, garage.id, 'Freezer', { circuitId: sub.circuits.find(c => c.space === 2).id });
  const l = M.loadOf(h, feeder);
  assert.equal(l.subTotal, 7700);
  assert.equal(l.total, 7700);
  assert.equal(l.capacity, 14400);
  assert.equal(l.sub, sub);
  assert.equal(M.autoLabel(h, feeder), 'Garage subpanel');
  assert.ok(M.isMapped(h, feeder));
  assert.equal(M.nextToTest(h, at(h, 16).id)?.space, 18, 'the feeder is skipped when flip-testing');
});

test('labels are written from what is on a breaker', () => {
  const h = house(20);
  const kitchen = M.addRoom(h, 'Kitchen');
  const bed = M.addRoom(h, 'Bedroom 2');
  const c = at(h, 7);
  M.addThing(h, kitchen.id, { kind: 'outlet', name: 'Counter left', circuitId: c.id });
  appliance(h, kitchen.id, 'Dishwasher', { circuitId: c.id });
  M.addThing(h, kitchen.id, { kind: 'light', name: 'Ceiling light' });
  assert.equal(M.autoLabel(h, c), 'Kitchen counter left, dishwasher');

  // Three generic outlets read as "outlets"; a whole room is just its name.
  const b = at(h, 8);
  for (let i = 0; i < 3; i++) M.addThing(h, bed.id, { kind: 'outlet', circuitId: b.id });
  assert.deepEqual(M.thingsIn(h, bed.id).map(t => t.name), ['Outlet 1', 'Outlet 2', 'Outlet 3']);
  assert.equal(M.autoLabel(h, b), 'Bedroom 2');
  M.addThing(h, bed.id, { kind: 'light', name: 'Ceiling light' });
  assert.equal(M.autoLabel(h, b), 'Bedroom 2 outlets');

  // Two rooms on one breaker, and a switch that goes without saying.
  M.addThing(h, bed.id, { kind: 'switch', name: 'By the door', circuitId: c.id });
  assert.equal(M.autoLabel(h, c), 'Kitchen counter left, dishwasher; Bedroom 2 by the door');
  const s = at(h, 9);
  M.addThing(h, kitchen.id, { kind: 'light', name: 'Pendant lights', circuitId: s.id });
  M.addThing(h, kitchen.id, { kind: 'switch', name: 'Pendant switch', circuitId: s.id });
  assert.equal(M.autoLabel(h, s), 'Kitchen pendant lights');

  // Your own label wins.
  c.label = 'Kitchen counter';
  assert.equal(M.labelOf(h, c), 'Kitchen counter');
  c.label = '  ';
  assert.match(M.labelOf(h, c), /^Kitchen counter left/);
  assert.equal(M.labelOf(h, at(h, 1)), '');
});

test('flip a breaker off and tap what went dead', () => {
  const h = house(12);
  const kitchen = M.addRoom(h, 'Kitchen');
  const a = M.addThing(h, kitchen.id, { kind: 'outlet' });
  const b = M.addThing(h, kitchen.id, { kind: 'outlet' });
  const fridge = appliance(h, kitchen.id, 'Fridge', { circuitId: at(h, 4).id });
  assert.deepEqual(M.progress(h), { circuits: 12, mapped: 1, tested: 0, things: 3, found: 1, unfound: 2 });
  assert.equal(b.name, 'Outlet 2', 'new outlets are numbered in their room');
  assert.equal(M.nextToTest(h).space, 1);

  const c = at(h, 1);
  M.startFlip(h, c.id);
  assert.equal(h.session.step, 'off');
  assert.equal(M.toggleDead(h, a.id), true);
  assert.equal(a.circuitId, c.id);
  assert.equal(M.toggleDead(h, fridge.id), true, 'something already on another breaker can be moved');
  assert.equal(fridge.circuitId, c.id);
  assert.equal(M.toggleDead(h, fridge.id), false, 'tapping it again puts it back');
  assert.equal(fridge.circuitId, at(h, 4).id);
  const found = M.addDeadThing(h, kitchen.id, { kind: 'light', name: 'Pantry light' });
  assert.equal(found.circuitId, c.id, 'something found while walking round goes straight on');
  assert.equal(M.thingsOn(h, c.id).length, 2);

  assert.equal(M.finishFlip(h), c);
  assert.ok(c.tested > 0);
  assert.equal(h.session.step, 'on');
  const p = M.progress(h);
  assert.equal(p.mapped, 2);
  assert.equal(p.tested, 1);
  assert.equal(p.unfound, 1);
  assert.equal(M.nextToTest(h, c.id).space, 2, 'next comes the next breaker with nothing known');
  assert.equal(M.nextToTest(h, at(h, 12).id).space, 2, 'and it wraps round');

  // Flipping one that turns out to power nothing still counts as mapped.
  M.startFlip(h, at(h, 2).id);
  M.finishFlip(h);
  assert.equal(M.progress(h).mapped, 3);
  M.stopSession(h);
  assert.equal(h.session, null);

  // Untapping on a re-test takes something off.
  M.startFlip(h, c.id);
  M.toggleDead(h, a.id);
  assert.equal(a.circuitId, null);
});

test('find one thing’s breaker: likeliest first', () => {
  const h = house(12);
  const laundry = M.addRoom(h, 'Laundry');
  const bath = M.addRoom(h, 'Bath');
  const d = at(h, 9);
  M.setPoles(h, d, 2); // 9/11
  d.amps = 30;
  const dryer = appliance(h, laundry.id, 'Electric dryer');
  assert.equal(M.candidates(h, dryer.id)[0], d, 'a 240 V appliance tries the double-pole breaker first');

  // A breaker already feeding the same room comes early; one that was walked round without finding it comes late.
  M.addThing(h, bath.id, { kind: 'light', circuitId: at(h, 6).id });
  at(h, 1).tested = 1;
  const outlet = M.addThing(h, bath.id, { kind: 'outlet' });
  const order = M.candidates(h, outlet.id);
  assert.equal(order[0].space, 6);
  assert.equal(order.at(-1), d, 'double-pole last for an outlet');
  assert.ok(order.indexOf(at(h, 1)) > order.indexOf(at(h, 2)), 'a tested breaker comes after an untested one');

  M.startFind(h, outlet.id);
  assert.equal(M.currentTry(h), at(h, 6));
  M.stillOn(h, at(h, 6).id);
  const next = M.currentTry(h);
  assert.notEqual(next, at(h, 6));
  assert.equal(M.wentOff(h, next.id), next);
  assert.equal(outlet.circuitId, next.id);
  assert.equal(h.session.step, 'found');
});

test('search finds things by room and name, and breakers by number', () => {
  const h = sampleHouse();
  const island = M.search(h, 'kitchen island');
  assert.deepEqual(island.things.map(t => t.name), ['Island']);
  assert.equal(M.circuitName(M.findCircuit(h, island.things[0].circuitId)), '2');
  assert.deepEqual(M.search(h, 'dryer').things.map(t => t.name).sort(), ['Electric dryer', 'Hair dryer']);
  assert.deepEqual(M.search(h, 'laundry dryer').things.map(t => t.name), ['Electric dryer']);
  const twelve = M.search(h, '12');
  assert.deepEqual(twelve.circuits.map(M.circuitName), ['12']);
  assert.equal(twelve.things.length, 3, 'everything on breaker 12');
  assert.ok(M.search(h, 'gfci').circuits.length >= 3);
  assert.deepEqual(M.search(h, '   '), { things: [], circuits: [] });
  const bed = M.search(h, 'Béd 2').things;
  assert.deepEqual(bed.slice(0, 3).map(t => M.roomOf(h, t).name), ['Bedroom 2', 'Bedroom 2', 'Bedroom 2'], 'accents and case don’t matter, and the room comes first');
});

test('the sample house is consistent', () => {
  const h = sampleHouse();
  const p = M.progress(h);
  assert.equal(p.circuits, 33);
  assert.equal(p.mapped, 28);
  assert.equal(p.unfound, 4);
  const circuits = M.allCircuits(h);
  for (const panel of h.panels) {
    const seen = new Set();
    for (const c of panel.circuits) for (const s of M.spacesOf(c)) {
      const key = `${s}${c.half || ''}`;
      assert.ok(!seen.has(key), `${panel.name} space ${key} is used twice`);
      seen.add(key);
      assert.ok(s >= 1 && s <= panel.spaces);
    }
  }
  for (const t of h.things) if (t.circuitId) assert.ok(circuits.some(c => c.id === t.circuitId));
  const report = M.loadReport(h);
  assert.deepEqual(report.filter(l => l.status === 'over').map(l => M.labelOf(h, l.circuit)), ['Office']);
  assert.deepEqual(report.filter(l => l.status === 'tight').map(l => M.circuitName(l.circuit)).sort(), ['13', '3']);
  assert.equal(h.panels[1].fedBy, circuits.find(c => M.circuitName(c) === '29/31' && M.panelOf(h, c) === h.panels[0]).id);
  assert.deepEqual(M.tidy(JSON.parse(JSON.stringify(h))), { ...h, session: null }, 'tidy leaves a good house alone');
});

test('tidy repairs a house from a file or a link', () => {
  const h = M.tidy({
    name: 'x'.repeat(100),
    panels: [{ id: 'p', spaces: 7, circuits: [
      { id: 'a', space: 1, amps: 20, kind: 'weird' },
      { id: 'b', space: 1, amps: 15 }, // overlaps a
      { id: 'c', space: 3, poles: 2, amps: 30, half: 'A' },
      { id: 'd', space: 5 }, // under c
    ] }],
    rooms: [{ id: 'r', name: 'Den', color: -3 }],
    things: [{ id: 't', roomId: 'r', kind: 'outlet', name: 'Outlet', circuitId: 'b' }, { id: 'u', roomId: 'nowhere' }],
    session: { mode: 'flip', circuit: 'gone' },
  });
  assert.equal(h.name.length, 60);
  assert.equal(h.panels[0].spaces, 8);
  assert.deepEqual(h.panels[0].circuits.map(c => c.id), ['a', 'c']);
  assert.equal(h.panels[0].circuits[0].kind, 'standard');
  assert.equal(h.panels[0].circuits[1].half, null);
  assert.equal(h.rooms[0].color, 9);
  assert.equal(h.things.length, 1);
  assert.equal(h.things[0].circuitId, null, 'b was dropped, so the outlet is unmapped');
  assert.equal(h.session, null);
});

test('a read-only link carries the whole map', async () => {
  const h = sampleHouse();
  const text = await pack(compact(h, 'Mark'));
  assert.equal(text[0], 'z', 'squeezed');
  assert.ok(text.length < 4000, `the link is ${text.length} characters`);
  const { house: back, from } = expand(await unpack(text));
  assert.equal(from, 'Mark');
  assert.equal(back.name, h.name);
  assert.equal(back.panels.length, 2);
  const labels = house => M.allCircuits(house).map(c => `${M.circuitName(c)} ${c.amps} ${c.kind} ${M.labelOf(house, c)}`);
  assert.deepEqual(labels(back), labels(h));
  assert.deepEqual(M.progress(back), M.progress(h));
  assert.equal(M.loadReport(back)[0].status, 'over');
  assert.equal(back.panels[1].fedBy, M.allCircuits(back).find(c => M.circuitName(c) === '29/31').id);
  // Plain (j) links read too, and junk doesn't.
  const plain = 'j' + Buffer.from(JSON.stringify(compact(h))).toString('base64url');
  assert.equal(expand(await unpack(plain)).house.things.length, h.things.length);
  await assert.rejects(() => unpack('xnope'));
  assert.throws(() => expand({ v: 2 }));
});

test('backups: the sample stays out, newer copies win, other files are refused', () => {
  const mine = house(12);
  mine.name = 'Home';
  const sample = sampleHouse();
  const state = { houses: [mine, sample], current: mine.id, name: 'Mark' };
  const text = backupText(state);
  const data = JSON.parse(text);
  assert.equal(data.app, 'breaker-box');
  assert.deepEqual(data.houses.map(h => h.name), ['Home']);

  const empty = { houses: [], current: null, name: '' };
  const { state: restored, added } = merge(empty, text);
  assert.equal(added, 1);
  assert.equal(restored.current, mine.id);
  assert.equal(restored.name, 'Mark');
  assert.equal(M.allCircuits(restored.houses[0]).length, 12);

  // The same backup again changes nothing; a newer one replaces.
  assert.equal(merge(restored, text).added, 0);
  const newer = JSON.parse(text);
  newer.houses[0].updated += 1000;
  newer.houses[0].name = 'Home, renamed';
  const again = merge(restored, JSON.stringify(newer));
  assert.equal(again.added, 1);
  assert.equal(again.state.houses[0].name, 'Home, renamed');

  assert.throws(() => merge(empty, '{"app":"on-balance","houses":[]}'), /isn’t a Breaker Box backup/);
  assert.throws(() => merge(empty, 'not json'), /isn’t a Breaker Box backup/);
});

test('the appliance list', () => {
  for (const a of APPLIANCES) {
    assert.ok(a.watts > 0, a.name);
    if (a.volts) assert.equal(a.volts, 240);
  }
  assert.equal(new Set(APPLIANCES.map(a => a.name)).size, APPLIANCES.length, 'no duplicates');
  assert.equal(appliancesFor('Kitchen')[0].name, 'Fridge');
  assert.equal(appliancesFor('Laundry room')[0].name, 'Washer');
  assert.equal(appliancesFor('Kitchen').length, APPLIANCES.length, 'every appliance is still offered');
  assert.equal(appliancesFor('Pantry').length, APPLIANCES.length);
});

test('the offline copy lists every file the page needs', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const dir of ['js', 'css', 'fonts']) {
    for (const f of await readdir(new URL(`../${dir}/`, import.meta.url))) {
      assert.ok(shell.includes(`${dir}/${f}`), `sw.js is missing ${dir}/${f}`);
    }
  }
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, f] of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) assert.ok(shell.includes(f), `sw.js is missing ${f}`);
});
