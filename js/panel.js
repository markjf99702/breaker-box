// The panel: drawn like the real thing with the door open, the sheet for changing a breaker,
// and setting up a panel (spaces, main breaker) or a subpanel.
import * as M from './model.js';
import { store } from './store.js';
import { app, esc, on, go, toast, sheet, choices, bindChoices, icon, roomDot, plural, W, numText } from './ui.js';
import { loadLine, loadBar } from './loads.js';

const TYPE_TAG = { gfci: 'GFCI', afci: 'AFCI', dual: 'AFCI/GFCI' };

// A circuit's room colours as a stripe, split when it reaches more than one room.
function stripe(house, c) {
  const rooms = M.roomsOn(house, c);
  if (!rooms.length) return '';
  const n = rooms.length;
  const stops = rooms.map((r, i) => `var(--r${r.color}) ${(i / n) * 100}% ${((i + 1) / n) * 100}%`).join(', ');
  return `--stripe: linear-gradient(180deg, ${stops});`;
}

function labelBits(house, c) {
  const text = M.labelOf(house, c);
  const tag = TYPE_TAG[c.kind] ? ` <em class="tag">${TYPE_TAG[c.kind]}</em>` : '';
  if (text) return `<span class="txt">${esc(text)}${tag}</span>`;
  if (c.tested) return `<span class="txt none">Nothing found${tag}</span>`;
  return `<span class="txt q">?${tag}</span>`;
}

function handle(c, { hl, off } = {}) {
  const cls = ['hdl', c.poles === 2 && 'dp', c.half && 'tan', hl === c.id && 'hl', off === c.id && 'off', TYPE_TAG[c.kind] && 'test-' + c.kind].filter(Boolean).join(' ');
  return `<span class="${cls}" aria-hidden="true"><i class="tog"></i>${c.poles === 2 ? '<i class="tog two"></i><i class="tie"></i>' : ''}<b>${c.amps}</b></span>`;
}

// The door open: numbers down the outside edges, breaker handles meeting in the middle, labels beside them.
// opts.hl: the breaker to pick out. opts.off: one shown switched off. opts.act: what tapping a breaker does (data-act).
export function panelDoor(house, panel, opts = {}) {
  const rows = panel.spaces / 2;
  const occ = M.occupancy(panel);
  const act = opts.act || 'brk';
  const cells = [];
  for (let s = 1; s <= panel.spaces; s++) {
    const side = M.sideOf(s);
    const row = M.rowOf(s) + 1;
    cells.push(`<span class="num ${side}" style="grid-row:${row}">${s}</span>`);
    const here = occ.get(s);
    if (!here) {
      cells.push(`<button type="button" class="blank ${side}" style="grid-row:${row}" data-act="${opts.readOnly ? '' : 'space'}" data-space="${s}" ${opts.readOnly ? 'disabled' : ''} aria-label="Space ${s}, empty"><span>Empty</span></button>`);
      continue;
    }
    const starts = here.filter(c => c.space === s);
    if (!starts.length) continue; // the lower half of a double-pole breaker from the row above
    const span = starts[0].poles === 2 ? 2 : 1;
    const sub = starts.map(c => {
      const fed = M.feedsPanel(house, c);
      const what = fed ? `<span class="txt">${esc(M.labelOf(house, c))}</span>` : labelBits(house, c);
      const cls = ['brk', side, opts.hl === c.id && 'hl', opts.off === c.id && 'off', !M.isMapped(house, c) && 'unmapped', fed && 'feeder'].filter(Boolean).join(' ');
      const label = `Breaker ${M.circuitName(c)}, ${c.amps} amp${c.poles === 2 ? ' double-pole' : ''}: ${M.labelOf(house, c) || (c.tested ? 'nothing found' : 'not mapped yet')}`;
      const lbl = `<span class="lbl" style="${stripe(house, c)}">${c.half ? `<small class="half">${c.half}</small>` : ''}${what}</span>`;
      return `<button type="button" class="${cls}" data-act="${act}" data-c="${c.id}" aria-label="${esc(label)}">${side === 'left' ? lbl + handle(c, opts) : handle(c, opts) + lbl}</button>`;
    }).join('');
    cells.push(`<div class="cell ${side}${starts.length > 1 ? ' tandem' : ''}" style="grid-row:${row} / span ${span}">${sub}</div>`);
  }
  const fedBy = panel.fedBy && M.findCircuit(house, panel.fedBy);
  const main = panel.mainAmps
    ? `<div class="main-brk"><span class="hdl dp big" aria-hidden="true"><i class="tog"></i><i class="tog two"></i><i class="tie"></i></span><span><b>Main ${panel.mainAmps}\u00a0A</b>${fedBy ? `<br><small>Fed from ${M.circuitName(fedBy)} in ${esc(M.panelOf(house, fedBy).name)}</small>` : ''}</span></div>`
    : `<div class="main-brk lugs"><span><b>No main breaker</b>${fedBy ? `<br><small>Fed from ${M.circuitName(fedBy)} in ${esc(M.panelOf(house, fedBy).name)}</small>` : ''}</span></div>`;
  return `
    <div class="door${opts.compact ? ' compact' : ''}">
      <div class="plate"><b>${esc(panel.name)}</b>${panel.where ? `<span>${esc(panel.where)}</span>` : ''}</div>
      ${main}
      <div class="bus" style="--rows:${rows}">${cells.join('')}</div>
    </div>`;
}

// A small picture of the panel with one breaker picked out, for finding it with the door open.
export function locator(house, c, off = false) {
  const panel = M.panelOf(house, c);
  const cells = [];
  const occ = M.occupancy(panel);
  for (let s = 1; s <= panel.spaces; s++) {
    const side = M.sideOf(s), row = M.rowOf(s) + 1;
    const here = (occ.get(s) || []).filter(x => x.space === s);
    if (!occ.get(s)) { cells.push(`<i class="m-blank ${side}" style="grid-row:${row}"></i>`); continue; }
    if (!here.length) continue;
    const span = here[0].poles === 2 ? 2 : 1;
    const me = here.some(x => x.id === c.id);
    cells.push(`<i class="m-h ${side}${me ? ' me' : ''}${me && off ? ' off' : ''}${here.length > 1 ? ' tan' : ''}" style="grid-row:${row} / span ${span}"></i>`);
  }
  const row = M.rowOf(c.space) + 1;
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const where = `${ord(row)} from the top on the ${M.sideOf(c.space)}`;
  return { html: `<div class="mini" style="--rows:${panel.spaces / 2}" aria-hidden="true">${cells.join('')}</div>`, where };
}

// ---------- The panel screen ----------

export function panelScreen(house, index = 0) {
  const panel = house.panels[index] || house.panels[0];
  if (!panel) return go('/setup', true);
  const p = M.progress(house);
  const empty = M.emptySpaces(panel).length;
  const tabs = `<nav class="ptabs" aria-label="Panels">${house.panels.map((x, i) => `<a href="#/panel/${i}" ${x === panel ? 'aria-current="page"' : ''}>${esc(x.name)}</a>`).join('')}<a href="#/panel/new" class="add">${icon('plus')}Subpanel</a></nav>`;
  const usedRooms = house.rooms.filter(r => M.thingsIn(house, r.id).some(t => t.circuitId && M.panelOf(house, M.findCircuit(house, t.circuitId) || {}) === panel));
  const fresh = !house.rooms.length && !p.mapped && index === 0;
  app.innerHTML = `
    ${tabs}
    ${fresh ? `<div class="card start-card">
      <h2>Next: the sizes, then the rooms</h2>
      <p>Tap any breaker that isn’t a 15\u00a0A single-pole and change it: kitchens and baths are often 20\u00a0A, and the dryer, range, water heater and AC are usually double-pole. The size is printed on the handle.</p>
      <a class="btn small" href="#/rooms">${icon('rooms')}List the rooms</a>
    </div>` : ''}
    <div class="split">
      <section class="door-wrap">${panelDoor(house, panel)}</section>
      <aside class="side">
        ${progressCard(house, p)}
        ${usedRooms.length ? `<div class="card legend"><h2>Rooms</h2><ul>${usedRooms.map(r => `<li>${roomDot(r)}${esc(r.name)}</li>`).join('')}</ul></div>` : ''}
        <div class="card tip">
          <p>Tap a breaker to set its size and type or see what’s on it. Numbers run down the left in odd numbers and down the right in even, like most panels in the US.</p>
          <div class="row-btns">
            <button type="button" class="btn small" data-act="settings">${icon('panel')}Panel details</button>
            ${empty ? `<button type="button" class="btn small" data-act="fill">Fill ${plural(empty, 'empty space')}</button>` : ''}
          </div>
        </div>
      </aside>
    </div>`;
  on({
    click(e) {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'brk') breakerSheet(house, M.findCircuit(house, b.dataset.c), () => panelScreen(house, index));
      if (act === 'space') spaceSheet(house, panel, Number(b.dataset.space), () => panelScreen(house, index));
      if (act === 'settings') panelSheet(house, panel, () => panelScreen(house, house.panels.indexOf(panel)));
      if (act === 'fill') {
        const added = M.fillEmpty(panel, 15);
        store.put(house);
        panelScreen(house, index);
        toast(`Added ${plural(added.length, '15 A breaker')}. Tap one to change it.`);
      }
    },
  });
}

export function progressCard(house, p = M.progress(house)) {
  const pct = p.circuits ? Math.round((p.mapped / p.circuits) * 100) : 0;
  const done = p.circuits && p.mapped === p.circuits && !p.unfound;
  return `
    <div class="card prog">
      <div class="prog-top"><b>${p.mapped} of ${plural(p.circuits, 'breaker')} mapped</b><span>${pct}%</span></div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <p>${p.things ? (p.unfound ? `${plural(p.unfound, 'thing')} not found yet, out of ${p.things}.` : `All ${plural(p.things, 'thing')} found.`) : 'No rooms or things listed yet.'}</p>
      ${done ? '<a class="btn primary wide" href="#/print">Print the directory</a>' : `<a class="btn primary wide" href="#/map">${icon('map')}${p.mapped ? 'Map the rest' : 'Start mapping'}</a>`}
    </div>`;
}

// ---------- A breaker ----------

export function breakerSheet(house, c, after) {
  if (!c) return;
  const panel = M.panelOf(house, c);
  const save = () => { store.put(house); after?.(); };
  const draw = () => {
    const things = M.thingsOn(house, c.id);
    const load = M.loadOf(house, c);
    const fed = M.feedsPanel(house, c);
    const amps = M.AMPS.includes(c.amps) ? M.AMPS : [...M.AMPS, c.amps].sort((a, b) => a - b);
    const poles = c.half ? 'tandem' : c.poles === 2 ? 'double' : 'single';
    sheet(`
      <h2 class="sheet-h">Breaker ${M.circuitName(c)}${house.panels.length > 1 ? ` <small>${esc(panel.name)}</small>` : ''}</h2>
      <label class="field"><span>Label</span>
        <input id="bLabel" maxlength="60" value="${esc(c.label)}" placeholder="${esc(M.autoLabel(house, c) || 'What it powers')}" autocomplete="off">
        <small class="hint">${M.autoLabel(house, c) ? 'Leave it blank and it’s written from what’s on the breaker.' : 'Or map it, and the label writes itself.'}</small>
      </label>
      <div class="field"><span>Size</span>${choices('amps', amps, c.amps, v => `${v}<small> A</small>`)}</div>
      <div class="field"><span>Kind</span>${choices('poles', ['single', 'double', 'tandem'], poles, v => ({ single: 'Single pole<small>120 V</small>', double: 'Double pole<small>240 V, two spaces</small>', tandem: 'Tandem<small>two in one space</small>' })[v])}</div>
      <div class="field"><span>Type</span>${choices('kind', Object.keys(M.BREAKER_KINDS), c.kind, v => M.BREAKER_KINDS[v])}
        <small class="hint">GFCI and AFCI breakers have a test button. GFCI protects wet places like baths and kitchens; AFCI protects against arcing in bedrooms and living areas. Dual function does both.</small></div>
      <div class="field"><span>On this breaker</span>
        ${fed ? `<p class="feeds">Feeds <b>${esc(fed.name)}</b>.</p>` : ''}
        ${things.length ? `<ul class="on-list">${things.map(t => {
          const r = M.roomOf(house, t);
          return `<li>${roomDot(r)}<span><b>${esc(t.name)}</b> <small>${esc(r?.name || '')}${t.watts ? ` · ${W(t.watts)}` : ''}</small></span><button type="button" class="x" data-off="${t.id}" aria-label="Take ${esc(t.name)} off this breaker">${icon('close')}</button></li>`;
        }).join('')}</ul>` : `<p class="hint">${c.tested ? 'Nothing went dead when this was flipped.' : 'Nothing mapped to it yet.'}</p>`}
        <button type="button" class="btn small" id="bAdd">${icon('plus')}Add things</button>
      </div>
      ${load.status !== 'unknown' ? `<div class="field"><span>Load</span>${loadBar(load)}<p class="load-say ${load.status}">${loadLine(house, load)}</p></div>` : ''}
      <div class="sheet-actions">
        <button type="button" class="btn primary" id="bFlip">${icon('map')}Flip-test this breaker</button>
        <button type="button" class="link-btn danger" id="bRemove">Remove this breaker</button>
      </div>`, (body, close) => {
      body.querySelector('#bLabel').addEventListener('input', e => { c.label = e.target.value; save(); });
      bindChoices(body, 'amps', v => { c.amps = Number(v); save(); draw(); });
      bindChoices(body, 'kind', v => { c.kind = v; save(); });
      bindChoices(body, 'poles', v => {
        const refused = v === 'double' && M.doubleProblem(house, c);
        if (refused) {
          toast(refused); // and a tandem stays one
        } else if (v === 'tandem') {
          M.setTandem(house, c, true);
          toast(`Space ${c.space} now holds ${c.space}A and ${c.space}B.`);
        } else {
          if (c.half) {
            const from = `${c.space}${c.half === 'A' ? 'B' : 'A'}`; // the other half, whose things move onto this one
            const r = M.setTandem(house, c, false);
            if (r.moved) toast(`Moved ${plural(r.moved, 'thing')} from ${from} onto ${c.space}.`);
          }
          const r = M.setPoles(house, c, v === 'double' ? 2 : 1);
          if (!r.ok) toast(r.error);
          else if (r.removed.length) toast(`It takes space ${c.space + 2} too, so the empty breaker there came out.`);
        }
        save();
        draw();
      });
      body.querySelectorAll('[data-off]').forEach(b => b.addEventListener('click', () => {
        M.findThing(house, b.dataset.off).circuitId = null;
        save();
        draw();
      }));
      body.querySelector('#bAdd').addEventListener('click', () => thingPicker(house, c, () => { save(); draw(); }));
      body.querySelector('#bFlip').addEventListener('click', () => {
        M.startFlip(house, c.id);
        store.put(house);
        close();
        go('/map');
      });
      body.querySelector('#bRemove').addEventListener('click', () => {
        const n = M.thingsOn(house, c.id).length;
        M.removeCircuit(house, c);
        save();
        close();
        toast(`Removed breaker ${M.circuitName(c)}${n ? `. ${plural(n, 'thing')} on it are unmapped again` : ''}.`);
      });
    });
  };
  draw();
}

// Pick things to put on a breaker: every room, with what's not found yet first.
export function thingPicker(house, c, done) {
  const draw = () => {
    const rooms = house.rooms.filter(r => M.thingsIn(house, r.id).length);
    sheet(`
      <h2 class="sheet-h">What’s on ${M.circuitName(c)}?</h2>
      <p class="hint">Tap everything this breaker powers. Things already on another breaker show its number.</p>
      ${rooms.length ? rooms.map(r => `
        <h3 class="room-h">${roomDot(r)}${esc(r.name)}</h3>
        <div class="things">${M.thingsIn(house, r.id).map(t => thingTile(house, t, c.id, true)).join('')}</div>`).join('') : '<p>No rooms yet. Add rooms and what’s in them on the Rooms tab.</p>'}
      <div class="sheet-actions"><button type="button" class="btn primary" data-close>Done</button></div>`, body => {
      body.addEventListener('click', e => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        const t = M.findThing(house, b.dataset.t);
        t.circuitId = t.circuitId === c.id ? null : c.id;
        store.put(house);
        b.outerHTML = thingTile(house, t, c.id, true);
      });
    }, done);
  };
  draw();
}

// A thing as a big tap target. `on` is the breaker being worked on: things on it show as dead.
export function thingTile(house, t, onId, picking = false) {
  const here = t.circuitId === onId;
  const other = !here && t.circuitId && M.findCircuit(house, t.circuitId);
  const on = `on ${numText(house, M.findCircuit(house, onId))}`;
  const state = here ? (picking ? `✓ ${on}` : `Dead · ${on}`) : other ? `On ${numText(house, other)}` : 'Not found yet';
  return `<button type="button" class="thing${here ? ' dead' : ''}${other ? ' elsewhere' : ''}" data-t="${t.id}" aria-pressed="${here}">
    ${icon(t.kind, 'k')}<span class="nm">${esc(t.name)}</span><span class="st">${esc(state)}</span></button>`;
}

function spaceSheet(house, panel, space, after) {
  sheet(`
    <h2 class="sheet-h">Space ${space} is empty</h2>
    <p class="hint">Most panels have a few spaces with a blank cover. If there’s a breaker here, add it.</p>
    <div class="sheet-actions">
      <button type="button" class="btn primary" id="sAdd">Add a breaker in space ${space}</button>
    </div>`, (body, close) => {
    body.querySelector('#sAdd').addEventListener('click', () => {
      const c = M.addCircuit(panel, space, { amps: 15 });
      store.put(house);
      after?.();
      close();
      breakerSheet(house, c, after);
    });
  });
}

// ---------- Setting up a panel ----------

// A new house with its main panel, or (sub) a subpanel for the current house.
export function setupScreen(house, { sub = false } = {}) {
  const feeders = sub && house ? M.allCircuits(house).filter(c => c.poles === 2 && !M.feedsPanel(house, c)) : [];
  let spaces = sub ? 12 : 40, mainAmps = sub ? 0 : 200;
  app.innerHTML = `
    <form class="setup card" id="setup" autocomplete="off">
      <p class="eyebrow">${sub ? esc(house.name) : 'Set up'}</p>
      <h1>${sub ? 'Add a subpanel' : 'Your panel'}</h1>
      ${sub ? '' : `<label class="field"><span>What to call this house</span><input id="hName" maxlength="60" value="${store.houses().some(h => !h.sample) ? '' : 'Home'}" placeholder="Home"></label>`}
      <label class="field"><span>Panel name</span><input id="pName" maxlength="60" value="${sub ? 'Subpanel' : 'Main panel'}"></label>
      <label class="field"><span>Where it is</span><input id="pWhere" maxlength="80" placeholder="${sub ? 'Garage, left wall' : 'Basement, by the stairs'}"></label>
      <div class="field"><span>How many spaces</span>
        <small class="hint">Count the numbered slots on both sides, including any with a blank cover. Odd numbers run down the left, even down the right.</small>
        ${choices('spaces', M.SPACE_COUNTS, spaces)}
        <div class="stepper"><button type="button" data-step="-2" aria-label="Two fewer">−</button><output id="spacesOut">${spaces}</output><button type="button" data-step="2" aria-label="Two more">+</button></div>
      </div>
      <div class="field"><span>Main breaker</span>
        <small class="hint">The big one at the top, usually marked 100, 150 or 200.${sub ? ' Many subpanels have none.' : ''}</small>
        ${choices('main', [0, ...M.MAIN_AMPS], mainAmps, v => (Number(v) ? `${v}<small> A</small>` : 'None'))}
      </div>
      ${sub ? `<label class="field"><span>Fed from</span>
        <select id="fedBy"><option value="">Not sure yet</option>${feeders.map(c => `<option value="${c.id}">${M.circuitName(c)} · ${c.amps} A · ${esc(M.panelOf(house, c).name)}</option>`).join('')}</select>
        <small class="hint">The double-pole breaker in the main panel that powers this one.</small></label>` : ''}
      <label class="check"><input type="checkbox" id="fill" checked><span>Start with a 15 A breaker in every space<small>Then tap the ones that are bigger, double-pole or empty. It’s quicker than adding them one by one.</small></span></label>
      <div class="sheet-actions"><button class="btn primary" type="submit">${sub ? 'Add the subpanel' : 'Make the panel'}</button>
      <a class="btn" href="#/${house ? 'panel' : ''}">Cancel</a></div>
    </form>`;
  const out = () => app.querySelector('#spacesOut');
  const setSpaces = n => {
    spaces = M.evenSpaces(n);
    out().textContent = spaces;
    app.querySelectorAll('.seg[data-name="spaces"] button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.v) === spaces)));
  };
  bindChoices(app, 'spaces', v => setSpaces(Number(v)));
  bindChoices(app, 'main', v => { mainAmps = Number(v); });
  on({
    click(e) {
      const b = e.target.closest('[data-step]');
      if (b) setSpaces(spaces + Number(b.dataset.step));
    },
    submit(e) {
      e.preventDefault();
      let h = house;
      if (!sub) {
        h = M.blankHouse(app.querySelector('#hName').value.trim() || 'Home');
      }
      const panel = M.addPanel(h, {
        name: app.querySelector('#pName').value.trim() || (sub ? 'Subpanel' : 'Main panel'),
        where: app.querySelector('#pWhere').value.trim(),
        spaces,
        mainAmps: mainAmps || null,
        fill: app.querySelector('#fill').checked ? 15 : 0,
        fedBy: sub ? app.querySelector('#fedBy').value || null : null,
      });
      store.put(h);
      store.use(h.id);
      go(`/panel/${h.panels.indexOf(panel)}`);
      toast(sub ? 'Subpanel added.' : 'Panel made. Tap any breaker that isn’t a single-pole 15 A.');
    },
  });
}

// "That would drop breaker 26 and what’s known about it." Or, for the breaker feeding a subpanel, which one.
function dropWarning(house, losing) {
  const names = losing.map(M.circuitName);
  const which = names.length === 1 ? `breaker ${names[0]}` : `breakers ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const feeder = losing.find(c => M.feedsPanel(house, c));
  const what = !feeder ? `${names.length === 1 ? '' : ','} and what’s known about ${names.length === 1 ? 'it' : 'them'}`
    : names.length === 1 ? `, which feeds ${M.feedsPanel(house, feeder).name}`
    : `, and ${M.circuitName(feeder)} feeds ${M.feedsPanel(house, feeder).name}`;
  return `That would drop ${which}${what}. Tap again to go ahead.`;
}

// Panel details: name, place, spaces, main breaker, what feeds it, and removing it.
export function panelSheet(house, panel, after) {
  const i = house.panels.indexOf(panel);
  const feeders = M.allCircuits(house).filter(c => c.poles === 2 && M.panelOf(house, c) !== panel && (!M.feedsPanel(house, c) || c.id === panel.fedBy));
  sheet(`
    <h2 class="sheet-h">${esc(panel.name)}</h2>
    <label class="field"><span>Name</span><input id="pName" maxlength="60" value="${esc(panel.name)}"></label>
    <label class="field"><span>Where it is</span><input id="pWhere" maxlength="80" value="${esc(panel.where)}"></label>
    <div class="field"><span>Spaces</span><div class="stepper"><button type="button" data-step="-2" aria-label="Two fewer">−</button><output id="pSpaces">${panel.spaces}</output><button type="button" data-step="2" aria-label="Two more">+</button></div></div>
    <div class="field"><span>Main breaker</span>${choices('main', [0, ...M.MAIN_AMPS], panel.mainAmps || 0, v => (Number(v) ? `${v}<small> A</small>` : 'None'))}</div>
    ${i > 0 ? `<label class="field"><span>Fed from</span><select id="fedBy"><option value="">Not sure yet</option>${feeders.map(c => `<option value="${c.id}" ${c.id === panel.fedBy ? 'selected' : ''}>${M.circuitName(c)} · ${c.amps} A · ${esc(M.panelOf(house, c).name)}</option>`).join('')}</select></label>` : ''}
    <div class="sheet-actions">
      <button type="button" class="btn primary" data-close>Done</button>
      ${house.panels.length > 1 ? `<button type="button" class="link-btn danger" id="pRemove">Remove this panel</button>` : ''}
    </div>`, (body, close) => {
    const save = () => { store.put(house); after?.(); };
    body.querySelector('#pName').addEventListener('input', e => { panel.name = e.target.value.trim() || 'Panel'; save(); });
    body.querySelector('#pWhere').addEventListener('input', e => { panel.where = e.target.value.trim(); save(); });
    bindChoices(body, 'main', v => { panel.mainAmps = Number(v) || null; save(); });
    body.querySelector('#fedBy')?.addEventListener('change', e => { panel.fedBy = e.target.value || null; save(); });
    body.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
      const next = M.evenSpaces(panel.spaces + Number(b.dataset.step));
      const losing = M.atRisk(house, panel, next);
      // Asks once for each size, so every further breaker lost asks again.
      if (losing.length && b.dataset.sure !== String(next)) {
        b.dataset.sure = String(next);
        return toast(dropWarning(house, losing));
      }
      M.resizePanel(house, panel, next);
      body.querySelector('#pSpaces').textContent = panel.spaces;
      save();
    }));
    body.querySelector('#pRemove')?.addEventListener('click', e => {
      if (!e.target.dataset.sure) {
        e.target.dataset.sure = '1';
        e.target.textContent = `Tap again to remove ${panel.name} and its breakers`;
        return;
      }
      M.removePanel(house, panel);
      store.put(house);
      close();
      go('/panel/0');
      toast(`Removed ${panel.name}.`);
    });
  });
}
