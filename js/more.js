// Search, and the More screen: houses, sharing a read-only copy, backups, the sample house.
import * as M from './model.js';
import { store } from './store.js';
import { viewLink } from './share.js';
import { sampleHouse } from './sample.js';
import { app, esc, on, go, toast, sheet, icon, roomDot, badge, plural, copy, canSave, download } from './ui.js';
import { breakerSheet } from './panel.js';
import { thingSheet } from './rooms.js';

// ---------- Search ----------

let lastQuery = '';

export function searchScreen(house, { readOnly = false, into = app, info } = {}) {
  const examples = [...new Set(house.things.filter(t => t.kind === 'appliance').map(t => t.name))].slice(0, 3);
  into.innerHTML = `
    ${readOnly ? '' : `<div class="shead"><p class="eyebrow">${esc(house.name)}</p><h1>Search</h1></div>`}
    <div class="search-box">${icon('search')}<input id="q" type="search" value="${esc(lastQuery)}" placeholder="${esc(examples.length ? `${examples.join(', ')}, a room or a number` : 'A room, a thing or a breaker number')}" aria-label="Search" autocomplete="off" enterkeyhint="search"></div>
    <div id="results" aria-live="polite"></div>`;
  const input = into.querySelector('#q');
  const results = into.querySelector('#results');
  const draw = () => {
    lastQuery = input.value;
    const { things, circuits } = M.search(house, input.value);
    if (!input.value.trim()) { results.innerHTML = `<p class="hint">Type what you’re looking for: “kitchen island”, “dryer”, “bedroom 2”, or a breaker number.</p>`; return; }
    if (!things.length && !circuits.length) { results.innerHTML = `<p class="hint">Nothing called that. Try one word, like the room or the appliance.</p>`; return; }
    results.innerHTML = `
      ${things.length ? `<ul class="results">${things.slice(0, 60).map(t => {
        const r = M.roomOf(house, t);
        return `<li><button type="button" class="res" data-t="${t.id}">${icon(t.kind, 'k')}<span><b>${esc(t.name)}</b><small>${roomDot(r)}${esc(r?.name || '')}</small></span>${badge(house, t.circuitId, 'big')}</button></li>`;
      }).join('')}</ul>` : ''}
      ${circuits.length ? `<h2 class="group-h">Breakers</h2><ul class="results">${circuits.slice(0, 40).map(c => `
        <li><button type="button" class="res" data-c="${c.id}">${badge(house, c.id, 'big')}<span><b>${esc(M.labelOf(house, c) || (c.tested ? 'Nothing found' : 'Not mapped yet'))}</b><small>${c.amps}\u00a0A · ${M.BREAKER_KINDS[c.kind]}${house.panels.length > 1 ? ` · ${esc(M.panelOf(house, c).name)}` : ''}</small></span></button></li>`).join('')}</ul>` : ''}`;
  };
  input.addEventListener('input', draw);
  results.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const t = b.dataset.t && M.findThing(house, b.dataset.t);
    const c = b.dataset.c ? M.findCircuit(house, b.dataset.c) : t?.circuitId && M.findCircuit(house, t.circuitId);
    if (readOnly) { if (c) info(house, c); return; }
    if (t) thingSheet(house, t, draw); else if (c) breakerSheet(house, c, draw);
  });
  draw();
  if (!readOnly) on({});
  if (!readOnly && matchMedia('(hover: hover)').matches) input.focus();
}

// ---------- More ----------

export function moreScreen(house) {
  const houses = store.houses();
  app.innerHTML = `
    <div class="shead"><p class="eyebrow">${esc(house.name)}</p><h1>More</h1></div>
    <section class="card">
      <h2>This house</h2>
      <label class="field"><span>Name</span><input id="hName" maxlength="60" value="${esc(house.name)}" autocomplete="off"></label>
      ${houses.length > 1 ? `<div class="field"><span>Houses on this device</span><ul class="houses">${houses.map(h => `
        <li><button type="button" class="res${h === house ? ' here' : ''}" data-use="${h.id}">${icon('rooms', 'k')}<span><b>${esc(h.name)}</b><small>${h.sample ? 'Sample · ' : ''}${plural(M.allCircuits(h).length, 'breaker')}, ${plural(h.rooms.length, 'room')}</small></span>${h === house ? `<span class="tag">Open</span>` : ''}</button></li>`).join('')}</ul></div>` : ''}
      <div class="row-btns">
        <a class="btn small" href="#/setup">${icon('plus')}Another house</a>
        <a class="btn small" href="#/panel/new">${icon('plus')}A subpanel</a>
      </div>
    </section>
    <section class="card">
      <h2>Send it to someone in the house</h2>
      <p>A link to a read-only copy of the map, so they can look up a breaker without asking you. It carries the map in the link itself; nothing is uploaded.</p>
      <button type="button" class="btn" data-act="share">${icon('share')}Make a link</button>
    </section>
    <section class="card">
      <h2>Backup</h2>
      <p>Everything stays in this browser${store.saved ? '' : ', but this browser isn’t letting it save, so it will be gone when you close it'}. Save a backup file to keep it safe or move it to another phone or computer.</p>
      <div class="row-btns">
        <button type="button" class="btn" data-act="save" ${canSave() ? '' : 'hidden'}>Save a backup</button>
        <label class="btn">Load a backup<input type="file" id="loadBackup" accept=".json,application/json" hidden></label>
      </div>
    </section>
    <section class="card">
      <h2>Sample house</h2>
      <p>A made-up house with a mapped panel and a garage subpanel, to see how it all fits together.</p>
      ${house.sample ? `<button type="button" class="btn" data-act="unsample">Remove the sample house</button>` : `<button type="button" class="btn" data-act="sample">Look at the sample house</button>`}
    </section>
    <section class="card about">
      <h2>About</h2>
      <p>Breaker Box helps you work out which breaker does what: flip one off, see what went dead, and keep the map. Flipping breakers is fine. Opening the panel cover or changing wiring is a job for a licensed electrician.</p>
      <p>Part of <a href="https://junkdrawer.works/">junkdrawer.works</a>. No account, nothing sent anywhere.</p>
      ${house.sample ? '' : `<button type="button" class="link-btn danger" data-act="remove">Remove ${esc(house.name)} from this device</button>`}
    </section>`;
  on({
    input(e) {
      if (e.target.id === 'hName') { house.name = e.target.value.trim() || 'Home'; store.put(house); document.getElementById('houseName').textContent = house.name; }
    },
    async change(e) {
      if (e.target.id !== 'loadBackup' || !e.target.files[0]) return;
      try {
        const n = store.restore(await e.target.files[0].text());
        toast(n ? `Loaded ${plural(n, 'house')}.` : 'Nothing newer in that backup.');
        go('/panel');
      } catch (err) {
        toast(err.message);
      }
    },
    click(e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.use) { store.use(b.dataset.use); go('/panel'); return; }
      const act = b.dataset.act;
      if (act === 'share') shareSheet(house);
      if (act === 'save') download(`breaker-box-${new Date().toISOString().slice(0, 10)}.json`, store.backup());
      if (act === 'sample') openSample();
      if (act === 'unsample') { store.remove(house.id); go(store.house() ? '/panel' : '/'); toast('Sample house removed.'); }
      if (act === 'remove') {
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = `Tap again to remove ${house.name} and its map`; return; }
        store.remove(house.id);
        go(store.house() ? '/panel' : '/');
        toast(`Removed ${house.name}.`);
      }
    },
  });
}

export function openSample() {
  const had = store.houses().find(h => h.sample);
  const h = had || sampleHouse();
  store.put(h);
  store.use(h.id);
  go('/panel');
}

function shareSheet(house) {
  sheet(`
    <h2 class="sheet-h">Send a read-only copy</h2>
    <label class="field"><span>Your name</span><input id="shName" maxlength="40" value="${esc(store.name)}" placeholder="So they know who it’s from" autocomplete="name"></label>
    <label class="field"><span>Link</span><textarea id="shLink" rows="3" readonly></textarea></label>
    <p class="hint">Anyone with the link can see the map. Changes you make later need a new link.</p>
    <div class="sheet-actions">
      <button type="button" class="btn primary" id="shCopy">Copy link</button>
      ${navigator.share ? '<button type="button" class="btn" id="shSend">Send…</button>' : ''}
    </div>`, body => {
    const field = body.querySelector('#shLink');
    const make = async () => { field.value = await viewLink(house, store.name); };
    body.querySelector('#shName').addEventListener('input', e => { store.name = e.target.value; make(); });
    body.querySelector('#shCopy').addEventListener('click', async () => { if (!field.value) await make(); copy(field.value, field); });
    body.querySelector('#shSend')?.addEventListener('click', async () => {
      await make();
      try { await navigator.share({ title: `${house.name}: breaker map`, url: field.value }); } catch { /* cancelled */ }
    });
    make();
  });
}
