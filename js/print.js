// Printing: a directory card for the inside of the panel door, in the usual two-column numbered form,
// and a room-by-room list. Both print on ordinary paper; the card has a dashed line to cut along.
import * as M from './model.js';
import { app, esc, on, icon, plural } from './ui.js';

export const SIZES = {
  '4x6': { w: 4, h: 6, label: '4 × 6 in' },
  '5x8': { w: 5, h: 8, label: '5 × 8 in' },
  '5.5x8.5': { w: 5.5, h: 8.5, label: '5½ × 8½ in' },
  page: { w: 7.2, h: 9.4, label: 'Full page' },
};

// What's on the screen between visits: the card size and what to print. Anything else in the saved copy is
// left alone, such as the panels older versions kept, which left out any added since, or anything odd.
const opts = { size: '5x8', card: true, list: true };
try {
  const saved = JSON.parse(localStorage.getItem('breaker-box-print'));
  if (Object.hasOwn(SIZES, saved?.size)) opts.size = saved.size;
  for (const k of ['card', 'list']) if (typeof saved?.[k] === 'boolean') opts[k] = saved[k];
} catch { /* defaults */ }
const remember = () => { try { localStorage.setItem('breaker-box-print', JSON.stringify(opts)); } catch { /* fine */ } };
// The panels to print: every one at the start of each visit.
let panels = [];

const month = t => new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

// One card: the panel's name at the top, then odd spaces down the left and even down the right.
export function cardHTML(house, panel, size) {
  const { w, h } = SIZES[size] || SIZES['5x8'];
  const rows = panel.spaces / 2;
  const occ = M.occupancy(panel);
  const cells = [];
  for (let s = 1; s <= panel.spaces; s++) {
    const side = M.sideOf(s), row = M.rowOf(s) + 1;
    const here = occ.get(s);
    const starts = (here || []).filter(c => c.space === s);
    if (here && !starts.length) continue; // under a double-pole breaker
    const span = starts[0]?.poles === 2 ? 2 : 1;
    const lines = starts.length ? starts.map(c => {
      const rooms = M.roomsOn(house, c);
      const text = M.labelOf(house, c) || (c.tested ? 'Spare' : '');
      const kind = { gfci: ' GFCI', afci: ' AFCI', dual: ' AFCI/GFCI' }[c.kind] || '';
      return `<span class="pl">${rooms.length ? `<i class="pdot" style="--rc:var(--r${rooms[0].color})"></i>` : ''}<b class="pn">${M.circuitName(c)}</b><span class="pt">${esc(text)}</span><span class="pa">${c.amps}${c.poles === 2 ? '/240' : ''}${kind}</span></span>`;
    }).join('') : `<span class="pl empty"><b class="pn">${s}</b><span class="pt"></span></span>`;
    cells.push(`<div class="pc ${side}${starts.length > 1 ? ' two' : ''}${span === 2 ? ' dp' : ''}" style="grid-row:${row} / span ${span}">${lines}</div>`);
  }
  const fed = panel.fedBy && M.findCircuit(house, panel.fedBy);
  const tested = M.allCircuits(house).filter(c => M.panelOf(house, c) === panel).map(c => c.tested).filter(Boolean);
  return `
    <div class="pcard-wrap">
      <div class="pcard" style="width:${w}in;height:${h}in" data-rows="${rows}">
        <header class="phead">
          <b>${esc(panel.name)}</b>
          <span>${panel.mainAmps ? `${panel.mainAmps}\u00a0A main` : 'No main breaker'}${fed ? ` · fed from ${M.circuitName(fed)}, ${esc(M.panelOf(house, fed).name)}` : ''}${panel.where ? ` · ${esc(panel.where)}` : ''}</span>
        </header>
        <div class="pgrid" style="grid-template-rows:repeat(${rows}, minmax(0, 1fr))">${cells.join('')}</div>
        <footer class="pfoot"><span>${esc(house.name)}${tested.length ? ` · mapped ${month(Math.max(...tested))}` : ''}</span><span>Amps shown on the right. /240 is a double-pole breaker.</span></footer>
      </div>
      <p class="cutnote">Cut along the dashed line.${size === 'page' ? '' : ` The card is ${SIZES[size].label.replace(' in', ' inches')}.`}</p>
    </div>`;
}

export function listHTML(house) {
  const rooms = house.rooms.filter(r => M.thingsIn(house, r.id).length);
  const panelMark = c => (house.panels.length > 1 && M.panelOf(house, c) !== house.panels[0] ? `${M.panelOf(house, c).name.split(/\s+/)[0]} ` : '');
  return `
    <div class="plist">
      <header class="plhead"><b>${esc(house.name)}: room by room</b><span>Which breaker each thing is on</span></header>
      <div class="plcols">${rooms.map(r => `
        <section class="plroom">
          <h3><i class="pdot" style="--rc:var(--r${r.color})"></i>${esc(r.name)}</h3>
          <ul>${M.thingsIn(house, r.id).map(t => {
            const c = t.circuitId && M.findCircuit(house, t.circuitId);
            return `<li><span>${esc(t.name)}</span><i></i><b>${c ? panelMark(c) + M.circuitName(c) : '?'}</b></li>`;
          }).join('')}</ul>
        </section>`).join('')}
      </div>
      <footer class="pfoot"><span>? means not found yet.</span><span>Made with Breaker Box</span></footer>
    </div>`;
}

// Shrinks the card's writing until every label fits its space.
export function fitCards(root) {
  for (const card of root.querySelectorAll('.pcard')) {
    const rows = Number(card.dataset.rows);
    let fs = Math.min(11, Math.max(6, (card.clientHeight / 96) * 72 / rows * 0.44 + 2));
    const over = () => [...card.querySelectorAll('.pl')].some(el => el.scrollHeight > el.clientHeight + 1)
      || [...card.querySelectorAll('.pc')].some(el => el.scrollHeight > el.clientHeight + 1);
    card.style.setProperty('--fs', `${fs}pt`);
    while (over() && fs > 5) {
      fs -= 0.25;
      card.style.setProperty('--fs', `${fs}pt`);
    }
  }
}

export function printScreen(house) {
  panels = house.panels.map((_, i) => i);
  const draw = () => {
    const chosen = house.panels.filter((_, i) => panels.includes(i));
    const p = M.progress(house);
    app.innerHTML = `
      <div class="shead no-print"><p class="eyebrow">${esc(house.name)}</p><h1>Print</h1></div>
      <div class="card print-controls no-print">
        <div class="field"><span>What to print</span>
          <label class="check"><input type="checkbox" id="pCard" ${opts.card ? 'checked' : ''}><span>Panel directory<small>A card for the inside of the panel door: numbers down both sides, a short label for each breaker.</small></span></label>
          <label class="check"><input type="checkbox" id="pList" ${opts.list ? 'checked' : ''}><span>Room by room<small>Every room, everything in it and its breaker, on a page of its own.</small></span></label>
        </div>
        ${house.panels.length > 1 ? `<div class="field"><span>Panels</span>${house.panels.map((x, i) => `<label class="check"><input type="checkbox" data-panel="${i}" ${panels.includes(i) ? 'checked' : ''}><span>${esc(x.name)}</span></label>`).join('')}</div>` : ''}
        <div class="field"><span>Card size</span><div class="seg" data-name="size">${Object.entries(SIZES).map(([k, s]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === opts.size}">${s.label}</button>`).join('')}</div>
          <small class="hint">Measure the space for the directory inside the panel door. It prints on ordinary paper, with a dashed line to cut along; tape or slide it into the door.</small></div>
        ${p.circuits && p.mapped < p.circuits ? `<p class="hint warn">${plural(p.circuits - p.mapped, 'breaker')} ${p.circuits - p.mapped === 1 ? 'isn’t' : 'aren’t'} mapped yet and will print blank, ready to write in by hand.</p>` : ''}
        <button type="button" class="btn primary wide" id="doPrint">${icon('print')}Print</button>
      </div>
      <div id="printArea" class="print-area">
        ${opts.card ? chosen.map(x => `<div class="sheetpage card-page">${cardHTML(house, x, opts.size)}</div>`).join('') : ''}
        ${opts.list && house.rooms.length ? `<div class="sheetpage list-page">${listHTML(house)}</div>` : ''}
        ${!opts.card && !opts.list ? '<p class="hint no-print">Pick something to print.</p>' : ''}
      </div>`;
    fitCards(app);
    scalePreview();
  };
  draw();
  on({
    click(e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'doPrint') window.print();
      if (b.closest('.seg[data-name="size"]')) { opts.size = b.dataset.v; remember(); draw(); }
    },
    change(e) {
      if (e.target.id === 'pCard') opts.card = e.target.checked;
      if (e.target.id === 'pList') opts.list = e.target.checked;
      if (e.target.dataset.panel) {
        const i = Number(e.target.dataset.panel);
        panels = e.target.checked ? [...panels, i] : panels.filter(x => x !== i);
      }
      remember();
      draw();
    },
  });
}

// On a phone the preview is shrunk to fit the screen; printing always uses the real size.
function scalePreview() {
  const area = document.getElementById('printArea');
  if (!area) return;
  const room = area.clientWidth;
  for (const page of area.querySelectorAll('.sheetpage')) {
    page.style.zoom = '';
    const need = page.scrollWidth;
    page.style.zoom = need > room ? String(Math.floor((room / need) * 1000) / 1000) : '';
  }
}
addEventListener('resize', () => { if (document.getElementById('printArea')) scalePreview(); });
