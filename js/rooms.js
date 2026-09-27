// The house room by room: what's in each room and which breaker each thing is on.
// Adding rooms and things, and the sheets for changing them.
import * as M from './model.js';
import { ROOM_IDEAS, appliancesFor, PLACE_IDEAS } from './catalog.js';
import { store } from './store.js';
import { app, esc, on, go, toast, sheet, choices, bindChoices, icon, roomDot, badge, plural, W, KIND_LABEL } from './ui.js';

export function roomsScreen(house, focus = null) {
  const ideas = ROOM_IDEAS.filter(n => !house.rooms.some(r => r.name.toLowerCase() === n.toLowerCase()));
  const addRooms = `
    <div class="card add-rooms" id="addRooms">
      <h2>${house.rooms.length ? 'Add a room' : 'Which rooms does the house have?'}</h2>
      <p class="hint">Tap to add. Outside, the garage and the basement count too.</p>
      <div class="chips">${ideas.map(n => `<button type="button" class="chip" data-room="${esc(n)}">${icon('plus')}${esc(n)}</button>`).join('')}</div>
      <form class="inline-add" id="roomForm"><input id="roomName" maxlength="40" placeholder="Another room" autocomplete="off" aria-label="Room name"><button class="btn small" type="submit">Add</button></form>
    </div>`;
  const p = M.progress(house);
  app.innerHTML = `
    <div class="shead"><p class="eyebrow">${esc(house.name)}</p><h1>Rooms</h1>
      <p class="sub">${house.rooms.length ? `${plural(house.rooms.length, 'room')} · ${plural(p.things, 'thing')}${p.unfound ? ` · ${p.unfound} not found yet` : ''}` : 'List each room and what’s in it that runs on electricity.'}</p></div>
    ${house.rooms.length ? '' : addRooms}
    <div class="rooms">${house.rooms.map(r => roomCard(house, r)).join('')}</div>
    ${house.rooms.length ? addRooms : ''}`;
  if (focus) document.getElementById(`room-${focus}`)?.scrollIntoView({ block: 'start' });
  const redraw = id => { const y = scrollY; roomsScreen(house); scrollTo(0, y); if (id) document.querySelector(`[data-edit="${id}"]`)?.focus({ preventScroll: true }); };
  on({
    click(e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.room) {
        const r = M.addRoom(house, b.dataset.room);
        store.put(house);
        roomsScreen(house);
        document.getElementById(`room-${r.id}`)?.scrollIntoView({ block: 'center' });
        toast(`Added ${r.name}. Now add what’s in it.`);
      } else if (b.dataset.quick) {
        const [roomId, kind] = b.dataset.quick.split(':');
        if (kind === 'appliance') return applianceSheet(house, house.rooms.find(r => r.id === roomId), {}, () => redraw());
        const t = M.addThing(house, roomId, { kind });
        store.put(house);
        redraw();
        toast(`Added ${t.name}.`, { label: 'Name it', run: () => thingSheet(house, t, () => redraw()) });
      } else if (b.dataset.edit) {
        thingSheet(house, M.findThing(house, b.dataset.edit), () => redraw());
      } else if (b.dataset.roomEdit) {
        roomSheet(house, house.rooms.find(r => r.id === b.dataset.roomEdit), () => redraw());
      }
    },
    submit(e) {
      if (e.target.id !== 'roomForm') return;
      e.preventDefault();
      const name = app.querySelector('#roomName').value.trim();
      if (!name) return;
      const r = M.addRoom(house, name);
      store.put(house);
      roomsScreen(house);
      document.getElementById(`room-${r.id}`)?.scrollIntoView({ block: 'center' });
    },
  });
}

function roomCard(house, r) {
  const things = M.thingsIn(house, r.id);
  const found = things.filter(t => t.circuitId).length;
  return `
    <section class="card room" id="room-${r.id}" style="--rc:var(--r${r.color})">
      <header class="room-top">
        <h2>${roomDot(r)}${esc(r.name)}</h2>
        <span class="room-count">${things.length ? `${found} of ${things.length} found` : 'Nothing yet'}</span>
        <button type="button" class="icon-btn" data-room-edit="${r.id}" aria-label="Change ${esc(r.name)}">${icon('more')}</button>
      </header>
      ${things.length ? `<ul class="tlist">${things.map(t => `
        <li><button type="button" class="trow" data-edit="${t.id}">
          ${icon(t.kind, 'k')}<span class="tname">${esc(t.name)}${t.watts ? `<small>${W(t.watts)}${t.volts === 240 ? ' · 240 V' : ''}</small>` : ''}</span>${badge(house, t.circuitId)}
        </button></li>`).join('')}</ul>` : ''}
      <div class="quick" aria-label="Add to ${esc(r.name)}">
        ${['outlet', 'light', 'switch', 'appliance'].map(k => `<button type="button" data-quick="${r.id}:${k}">${icon('plus')}${KIND_LABEL[k]}</button>`).join('')}
      </div>
    </section>`;
}

// Appliances to add, the likely ones for the room first, with typical watts.
export function applianceSheet(house, room, { dead = false } = {}, done) {
  const added = [];
  sheet(`
    <h2 class="sheet-h">Add appliances to ${esc(room.name)}</h2>
    <p class="hint">Watts are typical figures for the load check. Change them to the number on the label if you know it.</p>
    <div class="chips apps">${appliancesFor(room.name).map(a => `<button type="button" class="chip" data-app="${esc(a.name)}">${esc(a.name)}<small>${W(a.watts)}${a.volts === 240 ? ' · 240 V' : ''}</small></button>`).join('')}</div>
    <form class="inline-add" id="appForm">
      <input id="appName" maxlength="60" placeholder="Something else" autocomplete="off" aria-label="Appliance name">
      <input id="appWatts" type="number" inputmode="numeric" min="0" max="20000" placeholder="Watts" aria-label="Watts">
      <button class="btn small" type="submit">Add</button>
    </form>
    <div class="sheet-actions"><button type="button" class="btn primary" data-close>Done</button></div>`, body => {
    const add = opts => {
      const t = dead ? M.addDeadThing(house, room.id, { kind: 'appliance', ...opts }) : M.addThing(house, room.id, { kind: 'appliance', ...opts });
      added.push(t);
      store.put(house);
      toast(`Added ${t.name}${dead ? ', on this breaker' : ''}.`);
    };
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-app]');
      if (!b) return;
      const a = appliancesFor().find(x => x.name === b.dataset.app);
      add({ name: a.name, watts: a.watts, volts: a.volts || 120, hours: a.hours });
      b.classList.add('added');
    });
    body.querySelector('#appForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = body.querySelector('#appName').value.trim();
      if (!name) return;
      add({ name, watts: Number(body.querySelector('#appWatts').value) || null });
      body.querySelector('#appName').value = '';
      body.querySelector('#appWatts').value = '';
    });
  }, () => done?.(added));
}

// Everything about one thing: its name, kind, room, watts and breaker.
export function thingSheet(house, t, after) {
  if (!t) return;
  const save = () => { store.put(house); after?.(); };
  const circuits = M.allCircuits(house);
  const draw = () => {
    const ideas = t.kind === 'appliance' ? [] : PLACE_IDEAS[t.kind] || [];
    sheet(`
      <h2 class="sheet-h">${icon(t.kind, 'k')} ${esc(t.name)}</h2>
      <label class="field"><span>Name</span><input id="tName" maxlength="60" value="${esc(t.name)}" autocomplete="off"></label>
      ${ideas.length ? `<div class="chips small">${ideas.map(n => `<button type="button" class="chip" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      <div class="field"><span>Kind</span>${choices('tkind', M.THING_KINDS, t.kind, v => KIND_LABEL[v])}</div>
      <label class="field"><span>Room</span><select id="tRoom">${house.rooms.map(r => `<option value="${r.id}" ${r.id === t.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <div class="field two">
        <label><span>Watts</span><input id="tWatts" type="number" inputmode="numeric" min="0" max="20000" value="${t.watts || ''}" placeholder="${t.kind === 'appliance' ? 'Unknown' : 'Leave blank'}"></label>
        <div class="checks">
          <label class="check"><input type="checkbox" id="tHours" ${t.hours ? 'checked' : ''}><span>Runs for hours at a time</span></label>
          <label class="check"><input type="checkbox" id="t240" ${t.volts === 240 ? 'checked' : ''}><span>Needs 240 V</span></label>
        </div>
      </div>
      <label class="field"><span>Breaker</span><select id="tCircuit"><option value="">Not found yet</option>${house.panels.map(p => `<optgroup label="${esc(p.name)}">${p.circuits.slice().sort(M.byPosition).map(c => `<option value="${c.id}" ${c.id === t.circuitId ? 'selected' : ''}>${M.circuitName(c)} · ${c.amps} A${M.labelOf(house, c) ? ` · ${esc(M.labelOf(house, c)).slice(0, 40)}` : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <div class="sheet-actions">
        ${circuits.length ? `<button type="button" class="btn primary" id="tFind">${icon('walk')}${t.circuitId ? 'Check its breaker' : 'Find its breaker'}</button>` : ''}
        <button type="button" class="link-btn danger" id="tRemove">Remove ${esc(t.name)}</button>
      </div>`, (body, close) => {
      const name = body.querySelector('#tName');
      name.addEventListener('input', () => { t.name = name.value.trim() || M.nextName(house, t.roomId, t.kind); save(); });
      body.querySelectorAll('[data-name]').forEach(b => b.addEventListener('click', () => { name.value = b.dataset.name; t.name = b.dataset.name; save(); }));
      bindChoices(body, 'tkind', v => { t.kind = v; save(); draw(); });
      body.querySelector('#tRoom').addEventListener('change', e => { t.roomId = e.target.value; save(); });
      body.querySelector('#tWatts').addEventListener('input', e => { const w = Number(e.target.value); t.watts = w > 0 ? Math.round(w) : null; save(); });
      body.querySelector('#tHours').addEventListener('change', e => { t.hours = e.target.checked; save(); });
      body.querySelector('#t240').addEventListener('change', e => { t.volts = e.target.checked ? 240 : 120; save(); });
      body.querySelector('#tCircuit').addEventListener('change', e => { t.circuitId = e.target.value || null; save(); });
      body.querySelector('#tFind')?.addEventListener('click', () => {
        M.startFind(house, t.id);
        store.put(house);
        close();
        go('/map');
      });
      body.querySelector('#tRemove').addEventListener('click', () => {
        const room = M.roomOf(house, t);
        M.removeThing(house, t);
        save();
        close();
        toast(`Removed ${t.name}.`, { label: 'Undo', run: () => { if (room && house.rooms.includes(room)) { house.things.push(t); save(); } } });
      });
    });
  };
  draw();
}

function roomSheet(house, room, after) {
  const n = M.thingsIn(house, room.id).length;
  sheet(`
    <h2 class="sheet-h">${roomDot(room)} ${esc(room.name)}</h2>
    <label class="field"><span>Name</span><input id="rName" maxlength="40" value="${esc(room.name)}" autocomplete="off"></label>
    <div class="field"><span>Colour on the panel</span><div class="swatches">${Array.from({ length: M.ROOM_COLORS }, (_, i) => `<button type="button" class="sw" style="--rc:var(--r${i})" data-color="${i}" aria-label="Colour ${i + 1}" aria-pressed="${i === room.color}"></button>`).join('')}</div></div>
    <div class="sheet-actions">
      <button type="button" class="btn primary" data-close>Done</button>
      <button type="button" class="link-btn danger" id="rRemove">Remove ${esc(room.name)}${n ? ` and its ${plural(n, 'thing')}` : ''}</button>
    </div>`, (body, close) => {
    const save = () => { store.put(house); after?.(); };
    body.querySelector('#rName').addEventListener('input', e => { room.name = e.target.value.trim() || 'Room'; save(); });
    body.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
      room.color = Number(b.dataset.color);
      body.querySelectorAll('[data-color]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      save();
    }));
    body.querySelector('#rRemove').addEventListener('click', e => {
      if (n && !e.target.dataset.sure) {
        e.target.dataset.sure = '1';
        e.target.textContent = `Tap again to remove ${room.name} and ${plural(n, 'thing')}`;
        return;
      }
      const things = M.thingsIn(house, room.id);
      const at = house.rooms.indexOf(room);
      M.removeRoom(house, room);
      save();
      close();
      toast(`Removed ${room.name}.`, { label: 'Undo', run: () => { house.rooms.splice(at, 0, room); house.things.push(...things); save(); } });
    });
  });
}
