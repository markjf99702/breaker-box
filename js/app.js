// The page: which screen goes with which address, the welcome screen, the sample banner,
// and opening a read-only copy someone sent.
import * as M from './model.js';
import { store } from './store.js';
import { readView } from './share.js';
import { sampleHouse } from './sample.js';
import { app, esc, on, go, toast, sheet, icon, roomDot, badge, plural, W } from './ui.js';
import { panelScreen, setupScreen, panelDoor, breakerSheet } from './panel.js';
import { roomsScreen } from './rooms.js';
import { mapScreen } from './map.js';
import { loadsScreen } from './loads.js';
import { printScreen } from './print.js';
import { moreScreen, searchScreen, openSample } from './more.js';

const TABS = [
  ['panel', 'Panel', 'panel'],
  ['rooms', 'Rooms', 'rooms'],
  ['map', 'Map it', 'map'],
  ['loads', 'Loads', 'loads'],
  ['print', 'Print', 'print'],
];

document.getElementById('tabs').innerHTML = TABS.map(([key, label, ic]) => `<a href="#/${key}" data-tab="${key}">${icon(ic)}<span>${label}</span></a>`).join('');
document.getElementById('searchLink').innerHTML = icon('search');
document.getElementById('moreLink').innerHTML = icon('more');

let lastPath = null;

function route() {
  const path = location.hash.replace(/^#\/?/, '');
  const [head, a] = path.split('/');
  if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  document.body.classList.remove('focus', 'viewing');
  document.querySelector('.sheet')?.open && document.querySelector('.sheet').close?.();

  if (head === 'view' && a) return view(a);
  if (head === 'sample') { openSample(); return; }

  const house = store.house();
  chrome(house, head);
  if (head === 'setup') return setupScreen(null);
  if (!house) return welcome();
  if (head === 'panel' && a === 'new') return setupScreen(house, { sub: true });

  document.title = `${house.name} · Breaker Box`;
  const screens = {
    panel: () => panelScreen(house, Number(a) || 0),
    rooms: () => roomsScreen(house, a),
    map: () => mapScreen(house),
    loads: () => loadsScreen(house),
    print: () => printScreen(house),
    search: () => searchScreen(house),
    more: () => moreScreen(house),
  };
  (screens[head] || screens.panel)();
  if (house.sample && !(head === 'map' && house.session)) sampleBanner(house);
  const pill = document.querySelector('[data-tab="map"]');
  const p = M.progress(house);
  pill.dataset.count = p.circuits - p.mapped || '';
}

// The top bar and the tabs: which house, which screen.
function chrome(house, head) {
  document.getElementById('houseName').textContent = house ? house.name : '';
  document.getElementById('tabs').hidden = !house || head === 'setup';
  document.getElementById('searchLink').hidden = !house;
  document.getElementById('moreLink').hidden = !house;
  const tab = head === 'panel' || !head ? 'panel' : head;
  document.querySelectorAll('[data-tab]').forEach(t => {
    if (t.dataset.tab === tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
}

function sampleBanner(house) {
  const mine = store.houses().find(h => !h.sample);
  app.insertAdjacentHTML('afterbegin', `
    <aside class="sample-banner" role="note">
      <p><b>This is the sample house.</b> Its panel and rooms are made up, so you can try everything before doing your own.</p>
      <div class="row-btns">${mine ? `<button type="button" class="btn small primary" data-sample="back">Back to ${esc(mine.name)}</button>` : '<a class="btn small primary" href="#/setup">Set up my panel</a>'}<button type="button" class="btn small" data-sample="remove">Remove the sample</button></div>
    </aside>`);
  app.querySelector('.sample-banner').addEventListener('click', e => {
    const b = e.target.closest('[data-sample]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.sample === 'remove') { store.remove(house.id); toast('Sample house removed.'); }
    else store.use(mine.id);
    go(store.house() ? '/panel' : '/');
    route();
  });
}

// ---------- First visit ----------

function welcome() {
  document.title = 'Breaker Box';
  const demo = sampleHouse(0);
  const panel = demo.panels[0];
  panel.spaces = 12;
  panel.circuits = panel.circuits.filter(c => M.spacesOf(c).every(s => s <= 12));
  app.innerHTML = `
    <section class="hero">
      <div class="hero-text">
        <h1>Map your breaker panel.</h1>
        <p class="lede">Flip a breaker off, walk round the house, and tap everything that went dead. Breaker Box builds the map as you go, checks what’s on each circuit, and prints a directory for the panel door.</p>
        <div class="row-btns hero-btns">
          <a class="btn primary big" href="#/setup">Set up my panel</a>
          <button type="button" class="btn big" data-act="sample">Try it with a sample house</button>
        </div>
      </div>
      <div class="hero-door" aria-hidden="true" inert>${panelDoor(demo, panel, { readOnly: true, compact: true, act: 'none' })}</div>
    </section>
    <ol class="how">
      <li><b>Set up the panel.</b> Count the spaces and note the big breakers: the double-pole ones for the dryer, range or AC take two spaces.</li>
      <li><b>List the rooms</b> and what’s in each: outlets, lights, switches, and appliances with their typical watts.</li>
      <li><b>Flip, walk, tap.</b> One breaker at a time, with your phone in one hand. Or pick an outlet and find which breaker it’s on.</li>
      <li><b>Print the directory</b>, sized for the panel door, and a room-by-room list. The load check flags circuits that are likely to trip.</li>
    </ol>
    <p class="calm">Flipping breakers is fine. Opening the panel cover or changing wiring is a job for a licensed electrician.</p>
    <div class="keep">
      <p>Your map stays in this browser. Nothing is sent anywhere unless you share a link.</p>
      <label class="link-btn">Load a backup<input type="file" id="loadBackup" accept=".json,application/json" hidden></label>
    </div>`;
  on({
    click(e) {
      if (e.target.closest('[data-act="sample"]')) openSample();
    },
    async change(e) {
      if (e.target.id !== 'loadBackup' || !e.target.files[0]) return;
      try {
        const n = store.restore(await e.target.files[0].text());
        toast(n ? `Loaded ${plural(n, 'house')}.` : 'Nothing in that backup.');
        go('/panel');
      } catch (err) { toast(err.message); }
    },
  });
}

// ---------- A read-only copy someone sent ----------

async function view(data) {
  document.body.classList.add('viewing');
  chrome(null, 'view');
  let got;
  try { got = await readView(data); } catch {
    app.innerHTML = `<div class="card empty"><h1>That link didn’t come through whole</h1><p>Ask for it again, or copy all of it into the address bar.</p><a class="btn" href="#/">Open Breaker Box</a></div>`;
    return on({});
  }
  const { house, from } = got;
  document.title = `${house.name} · Breaker Box`;
  app.innerHTML = `
    <aside class="sample-banner shared" role="note">
      <p><b>${esc(from ? `${from}’s map of ${house.name}` : house.name)}</b>, a read-only copy from ${new Date(house.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Look up a breaker below.</p>
      <div class="row-btns"><button type="button" class="btn small primary" data-act="keep">Keep a copy on this device</button></div>
    </aside>
    <div id="viewSearch"></div>
    ${house.panels.map(p => `<section class="door-wrap view-door">${panelDoor(house, p, { act: 'info' })}</section>`).join('')}
    <h2 class="group-h">Room by room</h2>
    <div class="rooms">${house.rooms.map(r => `
      <section class="card room" style="--rc:var(--r${r.color})">
        <header class="room-top"><h2>${roomDot(r)}${esc(r.name)}</h2></header>
        <ul class="tlist">${M.thingsIn(house, r.id).map(t => `<li><div class="trow">${icon(t.kind, 'k')}<span class="tname">${esc(t.name)}${t.watts ? `<small>${W(t.watts)}</small>` : ''}</span>${badge(house, t.circuitId)}</div></li>`).join('')}</ul>
      </section>`).join('')}</div>`;
  searchScreen(house, { readOnly: true, into: document.getElementById('viewSearch'), info });
  on({
    click(e) {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'info') info(house, M.findCircuit(house, b.dataset.c));
      if (b.dataset.act === 'keep') {
        const copyOf = M.tidy({ ...house, id: M.newId('h') });
        copyOf.name = house.name;
        store.put(copyOf);
        store.use(copyOf.id);
        go('/panel');
        toast(`${house.name} is saved on this device.`);
      }
    },
  });
}

// A breaker in a read-only copy: what's on it, nothing to change.
function info(house, c) {
  if (!c) return;
  const things = M.thingsOn(house, c.id);
  sheet(`
    <h2 class="sheet-h">Breaker ${M.circuitName(c)} <small>${c.amps}\u00a0A${c.poles === 2 ? ' · 240\u00a0V' : ''} · ${M.BREAKER_KINDS[c.kind]}</small></h2>
    <p class="hand big">${esc(M.labelOf(house, c) || (c.tested ? 'Nothing found' : 'Not mapped yet'))}</p>
    ${things.length ? `<ul class="on-list">${things.map(t => `<li>${roomDot(M.roomOf(house, t))}<span><b>${esc(t.name)}</b> <small>${esc(M.roomOf(house, t)?.name || '')}</small></span></li>`).join('')}</ul>` : ''}`);
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// For the screenshot tool and tests: the store and the model, so they can set things up without tapping through.
window.breakerBox = { store, M, sampleHouse, breakerSheet };
