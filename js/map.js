// Mapping, done on a phone at the panel and walking round the house.
// Breaker by breaker: flip one off, tap everything that went dead, turn it back on, next.
// Or the other way: pick one thing and try breakers until it goes off.
import * as M from './model.js';
import { ROOM_IDEAS } from './catalog.js';
import { store } from './store.js';
import { app, esc, on, toast, sheet, icon, roomDot, plural, KIND_LABEL, numText } from './ui.js';
import { panelDoor, locator, thingTile, progressCard } from './panel.js';
import { applianceSheet } from './rooms.js';
import { loadLine } from './loads.js';

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const focus = yes => document.body.classList.toggle('focus', yes);

// Keeps the screen on while you're mapping, where the browser allows it, so it doesn't lock between rooms.
let lock = null, wantAwake = false;
export async function keepAwake(on) {
  wantAwake = on;
  try {
    if (on && !lock && navigator.wakeLock && document.visibilityState === 'visible') {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch { lock = null; /* not allowed here; the screen may lock on its own */ }
}
document.addEventListener('visibilitychange', () => { if (wantAwake && document.visibilityState === 'visible') keepAwake(true); });

export function mapScreen(house) {
  const s = house.session;
  if (s?.mode === 'flip' && M.findCircuit(house, s.circuit)) { keepAwake(true); return flipScreen(house); }
  if (s?.mode === 'find' && M.findThing(house, s.thing)) { keepAwake(true); return findScreen(house); }
  if (s) { house.session = null; store.put(house); }
  keepAwake(false);
  focus(false);
  hub(house);
}

const start = (house, fn, id) => { fn(house, id); store.put(house); window.scrollTo(0, 0); mapScreen(house); };

// ---------- The starting point ----------

function hub(house) {
  const circuits = M.allCircuits(house);
  if (!circuits.length) {
    app.innerHTML = `<div class="shead"><p class="eyebrow">${esc(house.name)}</p><h1>Map it</h1></div>
      <div class="card empty"><p>There are no breakers yet. Set up the panel first.</p><a class="btn primary" href="#/panel">Go to the panel</a></div>`;
    return on({});
  }
  const next = M.nextToTest(house);
  const unfound = house.things.filter(t => !t.circuitId);
  const p = M.progress(house);
  app.innerHTML = `
    <div class="shead"><p class="eyebrow">${esc(house.name)}</p><h1>Map it</h1></div>
    <div class="split map-split">
      <div>
        <section class="card flip-card">
          <h2>${icon('map')}Breaker by breaker</h2>
          <p>Flip one breaker off, walk round and tap everything that went dead, then turn it back on. Take your phone, and a flashlight in case the lights go too.</p>
          ${next ? `
            <div class="next-up">${handleBadge(next)}<div><b>Next: breaker ${M.circuitName(next)}</b><small>${next.amps}\u00a0A${house.panels.length > 1 ? ` · ${esc(M.panelOf(house, next).name)}` : ''} · ${M.isMapped(house, next) ? 'not walked round yet' : 'nothing known yet'}</small></div></div>
            <button type="button" class="btn primary big wide" data-flip="${next.id}">Start with breaker ${M.circuitName(next)}</button>`
          : '<p class="done-note">Every breaker has been flipped and walked round.</p>'}
          <button type="button" class="btn wide" data-act="pick">Pick a different breaker</button>
        </section>
        <section class="card find-card">
          <h2>${icon('walk')}Find one thing’s breaker</h2>
          <p>Pick an outlet, light or appliance. Plug a lamp in or switch it on, then try breakers until it goes off; the likeliest ones come first.</p>
          ${unfound.length ? `<ul class="pick-list">${unfound.slice(0, 8).map(t => {
            const r = M.roomOf(house, t);
            return `<li><button type="button" data-find="${t.id}">${icon(t.kind, 'k')}<span><b>${esc(t.name)}</b><small>${roomDot(r)}${esc(r?.name || '')}</small></span>${icon('next', 'go')}</button></li>`;
          }).join('')}</ul>${unfound.length > 8 ? `<p class="hint">And ${unfound.length - 8} more on the Rooms tab.</p>` : ''}` : `<p class="hint">${house.things.length ? 'Everything listed has a breaker. Tap anything on the Rooms tab to check it again.' : 'Nothing listed yet. Add rooms and what’s in them on the Rooms tab, or add them as you go while a breaker is off.'}</p>`}
        </section>
      </div>
      <aside class="side">${progressCard(house, p).replace(/<a class="btn primary wide" href="#\/map">.*?<\/a>/s, '')}
        <div class="card tips">
          <h2>Before you start</h2>
          <ul>
            <li>Save your work: computers and the internet router may be on the breaker you flip.</li>
            <li>Turn on the lights in every room, and plug a lamp or a phone charger into outlets you can’t easily check.</li>
            <li>If an outlet is dead but its breaker is on, look for a GFCI outlet nearby with a Reset button.</li>
            <li>Keep the fridge and freezer shut while their breaker is off.</li>
          </ul>
        </div>
      </aside>
    </div>`;
  on({
    click(e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.flip) start(house, M.startFlip, b.dataset.flip);
      if (b.dataset.find) start(house, M.startFind, b.dataset.find);
      if (b.dataset.act === 'pick') pickBreaker(house, id => start(house, M.startFlip, id));
    },
  });
}

const handleBadge = c => `<span class="hdl solo${c.poles === 2 ? ' dp' : ''}" aria-hidden="true"><i class="tog"></i>${c.poles === 2 ? '<i class="tog two"></i><i class="tie"></i>' : ''}<b>${c.amps}</b></span>`;

// The whole panel in a sheet; tap a breaker to pick it.
function pickBreaker(house, picked, title = 'Pick a breaker') {
  let i = 0;
  const draw = () => {
    const tabs = house.panels.length > 1 ? `<div class="seg">${house.panels.map((p, n) => `<button type="button" data-panel="${n}" aria-checked="${n === i}" role="radio">${esc(p.name)}</button>`).join('')}</div>` : '';
    sheet(`<h2 class="sheet-h">${title}</h2>${tabs}${panelDoor(house, house.panels[i], { act: 'pick', readOnly: true, compact: true })}`, (body, close) => {
      body.addEventListener('click', e => {
        const p = e.target.closest('[data-panel]');
        if (p) { i = Number(p.dataset.panel); return draw(); }
        const b = e.target.closest('[data-act="pick"]');
        if (!b) return;
        close();
        picked(b.dataset.c);
      });
    });
  };
  draw();
}

// ---------- Breaker by breaker ----------

function flipScreen(house) {
  const s = house.session;
  const c = M.findCircuit(house, s.circuit);
  const name = M.circuitName(c);
  focus(s.step === 'walk');
  if (s.step === 'off') {
    const loc = locator(house, c);
    app.innerHTML = `
      <div class="flip-step">
        <p class="eyebrow">Breaker by breaker</p>
        <div class="locate">
          ${loc.html}
          <div>
            <h1 class="say">Flip breaker ${name} off.</h1>
            <p class="where">${c.amps}\u00a0A${c.poles === 2 ? ' double-pole' : ''}. ${house.panels.length > 1 ? `In the ${esc(M.panelOf(house, c).name.toLowerCase())}, ${loc.where}` : cap(loc.where)}.</p>
            ${M.labelOf(house, c) ? `<p class="was">Marked now: <span class="hand">${esc(M.labelOf(house, c))}</span></p>` : ''}
          </div>
        </div>
        <p class="hint">Then walk round and look for what went dead.</p>
        <div class="step-actions">
          <button type="button" class="btn primary big wide" data-act="off">It’s off</button>
          <div class="row-btns"><button type="button" class="btn" data-act="other">Pick another</button><button type="button" class="btn" data-act="stop">Stop</button></div>
        </div>
      </div>`;
  } else if (s.step === 'walk') {
    walkScreen(house, c);
    return;
  } else {
    const things = M.thingsOn(house, c.id);
    const next = M.nextToTest(house, c.id);
    const load = M.loadOf(house, c);
    const rooms = M.roomsOn(house, c);
    app.innerHTML = `
      <div class="flip-step">
        <p class="eyebrow">Breaker ${name}</p>
        <h1 class="say">Turn breaker ${name} back on.</h1>
        ${things.length ? `<div class="card found-card">
          <h2>On ${name}: ${plural(things.length, 'thing')}</h2>
          ${rooms.map(r => `<p>${roomDot(r)}<b>${esc(r.name)}</b> ${M.thingsOn(house, c.id).filter(t => t.roomId === r.id).map(t => esc(t.name)).join(', ')}</p>`).join('')}
          ${load.status !== 'unknown' ? `<p class="load-say ${load.status}">${loadLine(house, load)}</p>` : ''}
        </div>` : `<div class="card found-card"><p>Nothing went dead on ${name}. It may be a spare, or power something that isn’t listed yet.</p></div>`}
        <label class="field"><span>Label for the directory</span>
          <input id="fLabel" maxlength="60" value="${esc(c.label)}" placeholder="${esc(M.autoLabel(house, c) || 'Spare')}" autocomplete="off">
          <small class="hint">${things.length ? 'Leave it blank to use the one written from what’s on it.' : 'Write “Spare” if nothing uses it.'}</small>
        </label>
        <div class="step-actions">
          ${next ? `<button type="button" class="btn primary big wide" data-flip="${next.id}">Next: breaker ${M.circuitName(next)}${icon('next')}</button>` : '<p class="done-note">That was the last one. Every breaker has been walked round.</p>'}
          <div class="row-btns"><button type="button" class="btn" data-act="again">Redo ${name}</button><button type="button" class="btn" data-act="done">${next ? 'Done for now' : 'Done'}</button></div>
        </div>
      </div>`;
  }
  on({
    click(e) {
      const b = e.target.closest('button');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'off') { s.step = 'walk'; store.put(house); window.scrollTo(0, 0); flipScreen(house); }
      if (act === 'stop' || act === 'done') { M.stopSession(house); store.put(house); mapScreen(house); }
      if (act === 'other') pickBreaker(house, id => start(house, M.startFlip, id));
      if (act === 'again') start(house, M.startFlip, c.id);
      if (b.dataset.flip) start(house, M.startFlip, b.dataset.flip);
    },
    input(e) {
      if (e.target.id === 'fLabel') { c.label = e.target.value; store.put(house); }
    },
  });
}

// Breaker off: every room, every thing in it as a big button. Tap what went dead.
function walkScreen(house, c) {
  const s = house.session;
  const name = M.circuitName(c);
  const tapped = () => M.thingsOn(house, c.id).length;
  const roomSection = r => {
    const things = M.thingsIn(house, r.id);
    const open = !things.length || things.some(t => !t.circuitId || t.circuitId === c.id || Object.hasOwn(s.was, t.id));
    return `<section class="walk-room" id="w-${r.id}" style="--rc:var(--r${r.color})">
      <details ${open ? 'open' : ''}>
        <summary><h2>${roomDot(r)}${esc(r.name)}</h2><span class="room-count" data-count="${r.id}">${roomCount(house, r, c)}</span></summary>
        <div class="things">${things.map(t => thingTile(house, t, c.id)).join('')}</div>
        <div class="quick" aria-label="Add something dead in ${esc(r.name)}">
          ${['outlet', 'light', 'switch', 'appliance'].map(k => `<button type="button" data-add="${r.id}:${k}">${icon('plus')}${KIND_LABEL[k]}</button>`).join('')}
        </div>
      </details>
    </section>`;
  };
  app.innerHTML = `
    <div class="walk-head">
      <div class="off-strip"><span class="hdl solo off${c.poles === 2 ? ' dp' : ''}" aria-hidden="true"><i class="tog"></i>${c.poles === 2 ? '<i class="tog two"></i><i class="tie"></i>' : ''}<b>${c.amps}</b></span>
        <div><b>Breaker ${name} is off</b><small>Tap everything that went dead.</small></div>
        <button type="button" class="btn small ghost" data-act="stop">Stop</button></div>
      ${house.rooms.length > 1 ? `<nav class="jump" aria-label="Rooms">${house.rooms.map(r => `<a href="#w-${r.id}" data-jump="${r.id}">${roomDot(r)}${esc(r.name)}</a>`).join('')}</nav>` : ''}
    </div>
    ${house.rooms.length ? '' : '<div class="card empty"><p>No rooms listed yet. Add the room you’re in, then what went dead in it.</p></div>'}
    <div class="walk">${house.rooms.map(roomSection).join('')}</div>
    <button type="button" class="btn wide add-room" data-act="room">${icon('plus')}Add a room</button>
    <div class="walk-bar">
      <span class="dead-count" id="deadCount" aria-live="polite">${deadText(tapped())}</span>
      <button type="button" class="btn primary big" data-act="on">${tapped() ? 'Done' : 'Nothing went dead'}${icon('next')}</button>
    </div>`;
  const refresh = () => {
    const n = tapped();
    app.querySelector('#deadCount').textContent = deadText(n);
    app.querySelector('[data-act="on"]').firstChild.textContent = n ? 'Done' : 'Nothing went dead';
  };
  on({
    click(e) {
      const jump = e.target.closest('[data-jump]');
      if (jump) {
        e.preventDefault();
        const sec = document.getElementById(`w-${jump.dataset.jump}`);
        sec.querySelector('details').open = true;
        // Just below the header, which sticks under the top bar; straight there when the phone asks for less motion.
        const head = app.querySelector('.walk-head');
        const cover = (parseFloat(getComputedStyle(head).top) || 0) + head.getBoundingClientRect().height;
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: sec.getBoundingClientRect().top + scrollY - cover - 8, behavior: still ? 'auto' : 'smooth' });
        return;
      }
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.t) {
        const dead = M.toggleDead(house, b.dataset.t);
        store.put(house);
        const t = M.findThing(house, b.dataset.t);
        b.outerHTML = thingTile(house, t, c.id);
        const r = M.roomOf(house, t);
        app.querySelector(`[data-count="${r.id}"]`).textContent = roomCount(house, r, c);
        if (dead && navigator.vibrate) try { navigator.vibrate(12); } catch { /* not allowed */ }
        refresh();
      } else if (b.dataset.add) {
        const [roomId, kind] = b.dataset.add.split(':');
        const room = house.rooms.find(r => r.id === roomId);
        if (kind === 'appliance') {
          return applianceSheet(house, room, { dead: true }, added => { if (added.length) walkScreenKeep(house, c); });
        }
        const t = M.addDeadThing(house, roomId, { kind });
        store.put(house);
        walkScreenKeep(house, c);
        toast(`Added ${t.name} in ${room.name}, dead on ${name}.`);
      } else if (b.dataset.act === 'room') {
        addRoomSheet(house, r => { walkScreenKeep(house, c); document.getElementById(`w-${r.id}`)?.scrollIntoView({ block: 'center' }); });
      } else if (b.dataset.act === 'on') {
        M.finishFlip(house);
        store.put(house);
        window.scrollTo(0, 0);
        flipScreen(house);
      } else if (b.dataset.act === 'stop') {
        M.stopSession(house);
        store.put(house);
        mapScreen(house);
        toast(tapped() ? `Stopped. What you tapped stays on ${name}.` : 'Stopped.');
      }
    },
  });
}

function walkScreenKeep(house, c) {
  const y = scrollY;
  walkScreen(house, c);
  window.scrollTo(0, y);
}

const deadText = n => (n ? `${plural(n, 'thing')} dead` : '');

function roomCount(house, r, c) {
  const things = M.thingsIn(house, r.id);
  if (!things.length) return 'Nothing listed';
  const dead = things.filter(t => t.circuitId === c.id).length;
  const left = things.filter(t => !t.circuitId).length;
  return [dead && `${dead} dead`, left && `${left} not found`].filter(Boolean).join(' · ') || 'All found';
}

function addRoomSheet(house, added) {
  const ideas = ROOM_IDEAS.filter(n => !house.rooms.some(r => r.name.toLowerCase() === n.toLowerCase()));
  sheet(`
    <h2 class="sheet-h">Add a room</h2>
    <div class="chips">${ideas.map(n => `<button type="button" class="chip" data-room="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <form class="inline-add" id="roomForm"><input id="roomName" maxlength="40" placeholder="Another room" autocomplete="off" aria-label="Room name"><button class="btn small" type="submit">Add</button></form>`, (body, close) => {
    const add = n => { const r = M.addRoom(house, n); store.put(house); close(); added(r); };
    body.addEventListener('click', e => { const b = e.target.closest('[data-room]'); if (b) add(b.dataset.room); });
    body.querySelector('#roomForm').addEventListener('submit', e => { e.preventDefault(); const n = body.querySelector('#roomName').value.trim(); if (n) add(n); });
  });
}

// ---------- One thing: which breaker is it on? ----------

const HOW = {
  outlet: 'Plug in a lamp or a radio so you can tell when it goes off.',
  light: 'Switch it on so you can see it go out.',
  switch: 'Switch on whatever it controls.',
  appliance: 'Switch it on, or listen for it running.',
};

function findScreen(house) {
  const s = house.session;
  const t = M.findThing(house, s.thing);
  const r = M.roomOf(house, t);
  focus(false);
  // The breaker it was found on has gone (removed, or the panel made smaller): carry on trying the rest.
  if (s.step === 'found' && !M.findCircuit(house, s.found)) { s.step = 'try'; s.found = null; store.put(house); }
  if (s.step === 'found') {
    const c = M.findCircuit(house, s.found);
    const others = M.thingsOn(house, c.id).filter(x => x !== t);
    const nextThing = house.things.find(x => !x.circuitId && x !== t);
    app.innerHTML = `
      <div class="flip-step">
        <p class="eyebrow">Found it</p>
        <h1 class="say">${esc(t.name)} is on breaker ${M.circuitName(c)}.</h1>
        <p class="where">${c.tested ? `Turn ${M.circuitName(c)} back on.` : `Turn ${M.circuitName(c)} back on, or while it’s off, walk round and find everything else on it.`}</p>
        ${others.length ? `<div class="card found-card"><h2>Also on ${M.circuitName(c)}</h2><p>${others.map(x => `${esc(x.name)} <small>${esc(M.roomOf(house, x)?.name || '')}</small>`).join(', ')}</p></div>` : ''}
        <div class="step-actions">
          ${nextThing ? `<button type="button" class="btn primary big wide" data-find="${nextThing.id}">Next: ${esc(nextThing.name)} <small>${esc(M.roomOf(house, nextThing)?.name || '')}</small></button>` : ''}
          <div class="row-btns">${c.tested ? '' : `<button type="button" class="btn" data-walk="${c.id}">Find the rest on ${M.circuitName(c)}</button>`}<button type="button" class="btn" data-act="done">Done</button></div>
        </div>
      </div>`;
  } else {
    const c = M.currentTry(house);
    const tried = s.tried.map(id => M.findCircuit(house, id)).filter(Boolean);
    const last = tried.at(-1);
    const rest = M.candidates(house, t.id).filter(x => !s.tried.includes(x.id) && x !== c);
    const loc = c && locator(house, c);
    app.innerHTML = `
      <div class="flip-step">
        <p class="eyebrow">Find the breaker</p>
        <h1 class="say small">${icon(t.kind, 'k')} ${esc(t.name)} <span class="in">in ${esc(r?.name || '')}</span></h1>
        <p class="hint">${HOW[t.kind]}</p>
        ${c ? `
          <div class="card try-card">
            <div class="locate">${loc.html}<div>
              <h2 class="say">${last ? `Turn ${M.circuitName(last)} back on, then flip ${M.circuitName(c)} off.` : `Flip breaker ${M.circuitName(c)} off.`}</h2>
              <p class="where">${c.amps}\u00a0A. ${house.panels.length > 1 ? `In the ${esc(M.panelOf(house, c).name.toLowerCase())}, ${loc.where}` : cap(loc.where)}.</p>
              ${M.labelOf(house, c) ? `<p class="was">Marked: <span class="hand">${esc(M.labelOf(house, c))}</span></p>` : ''}
            </div></div>
            <p class="ask">Did it go off?</p>
            <div class="yes-no">
              <button type="button" class="btn primary big" data-went="${c.id}">It went off</button>
              <button type="button" class="btn big" data-still="${c.id}">Still on</button>
            </div>
          </div>
          <p class="hint">${tried.length ? `Tried ${tried.map(x => esc(numText(house, x))).join(', ')}. ` : ''}${rest.length ? `After this: ${rest.slice(0, 6).map(x => esc(numText(house, x))).join(', ')}${rest.length > 6 ? '…' : ''}` : 'This is the last one to try.'}</p>`
        : `<div class="card empty"><p>That was every breaker. If it never went off, check the lamp in another outlet, and look for a GFCI outlet nearby with a tripped Reset button: outlets downstream of one go dead when it trips.</p>
            <button type="button" class="btn" data-act="restart">Try them all again</button></div>`}
        <div class="row-btns"><button type="button" class="btn" data-act="pick">It was another breaker</button><button type="button" class="btn" data-act="stop">Stop</button></div>
      </div>`;
  }
  on({
    click(e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.went) { M.wentOff(house, b.dataset.went); store.put(house); window.scrollTo(0, 0); findScreen(house); }
      if (b.dataset.still) { M.stillOn(house, b.dataset.still); store.put(house); findScreen(house); }
      if (b.dataset.find) start(house, M.startFind, b.dataset.find);
      if (b.dataset.walk) { M.startFlip(house, b.dataset.walk).step = 'walk'; store.put(house); window.scrollTo(0, 0); mapScreen(house); }
      if (b.dataset.act === 'restart') start(house, M.startFind, t.id);
      if (b.dataset.act === 'pick') pickBreaker(house, id => { M.wentOff(house, id); store.put(house); findScreen(house); }, 'Which one turned it off?');
      if (b.dataset.act === 'stop' || b.dataset.act === 'done') { M.stopSession(house); store.put(house); mapScreen(house); }
    },
  });
}

