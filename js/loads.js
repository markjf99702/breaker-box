// The load check: what's known to be on each breaker against what it carries.
import * as M from './model.js';
import { app, esc, on, W, plural } from './ui.js';
import { breakerSheet } from './panel.js';

const names = items => {
  const n = items.map(i => i.thing.name.replace(/^[A-Z](?=[a-z])/, ch => ch.toLowerCase()));
  if (n.length <= 1) return n.join('');
  if (n.length > 3) return `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`;
  return `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// One plain sentence or two about a breaker's load.
export function loadLine(house, l) {
  const c = l.circuit;
  const carries = `A ${c.amps}\u00a0A breaker at ${M.volts(c)}\u00a0V carries ${W(l.capacity)}`;
  const big = [...l.items].sort((a, b) => b.watts - a.watts);
  const sub = l.sub ? ` That includes ${W(l.subTotal)} on ${esc(l.sub.name)}.` : '';
  let out;
  if (l.status === 'over') {
    const what = big.length > 1 ? `Running the ${esc(names(big))} at once comes to ${W(l.total)}` : l.sub ? `Everything known on it comes to ${W(l.total)}` : `${esc(cap(names(big)))} alone comes to ${W(l.total)}`;
    out = `${what}. ${carries}, so it will likely trip.${sub}${big.length > 1 ? ' Plugging one of the big ones in on another breaker would help.' : ''}`;
  } else if (l.status === 'tight' && l.why === 'hours') {
    const long = big.filter(i => i.hours);
    out = `${esc(cap(names(long)))} ${long.length > 1 ? 'run' : 'runs'} for hours at a time, ${W(l.hours)}. The usual guideline keeps that under 80% of the breaker, ${W(l.limit)} here.${sub}`;
  } else if (l.status === 'tight') {
    out = big.length > 1
      ? `${esc(cap(names(big)))} together come to ${W(l.total)}, close to the ${W(l.capacity)} this breaker carries. Fine one at a time; all at once is near the limit.${sub}`
      : `${esc(cap(names(big) || 'Everything known'))} comes to ${W(l.total)}, close to the ${W(l.capacity)} this breaker carries.${sub}`;
  } else if (l.status === 'ok') {
    out = `Known loads come to ${W(l.total)} of the ${W(l.capacity)} this breaker carries.${sub}`;
  } else {
    out = 'No watts known for anything on it yet.';
  }
  if (l.needs240.length) out += ` ${esc(cap(names(l.needs240.map(t => ({ thing: t })))))} usually ${l.needs240.length > 1 ? 'need' : 'needs'} a double-pole (240 V) breaker, and this one is single-pole. Worth checking its kind.`;
  return out;
}

export function loadBar(l) {
  const pct = Math.min(l.share, 1) * 100;
  return `<div class="lbar ${l.status}" role="img" aria-label="${W(l.total)} of ${W(l.capacity)}">
    <i class="fill" style="width:${pct.toFixed(1)}%"></i><i class="eighty" title="80%"></i>
  </div>
  <div class="lbar-nums"><span>${W(l.total)}</span><span>of ${W(l.capacity)}</span></div>`;
}

const HEAD = {
  over: ['Likely to trip', 'If everything listed runs at once.'],
  tight: ['Close to the limit', ''],
};

export function loadsScreen(house) {
  const all = M.loadReport(house);
  const groups = { over: [], tight: [], ok: [], unknown: [] };
  for (const l of all) groups[l.status].push(l);
  const known = all.length - groups.unknown.length;
  const card = l => {
    const c = l.circuit;
    return `<button type="button" class="card load ${l.status}" data-c="${c.id}">
      <div class="load-top"><span class="bno big">${M.circuitName(c)}</span><span class="load-name"><b>${esc(M.labelOf(house, c) || 'Not mapped')}</b><small>${c.amps}\u00a0A · ${M.volts(c)}\u00a0V${house.panels.length > 1 ? ` · ${esc(M.panelOf(house, c).name)}` : ''}</small></span></div>
      ${loadBar(l)}
      <p class="load-say">${loadLine(house, l)}</p>
    </button>`;
  };
  app.innerHTML = `
    <div class="shead"><p class="eyebrow">${esc(house.name)}</p><h1>Load check</h1></div>
    <div class="card explain">
      <p>Each breaker carries its volts times its amps: 120 V × 15 A is ${W(1800)}. Things that run for hours at a time, like heaters, should stay under 80% of that. Breaker Box adds up the watts of what’s mapped to each breaker.</p>
      <p class="hint">The watts are typical figures. The label on an appliance has the real number; change it on the Rooms tab. Flipping breakers to map them is fine; opening the panel cover or changing wiring is a job for a licensed electrician.</p>
    </div>
    <div class="tally"${known ? '' : ' hidden'}>
      <span class="t over"><b>${groups.over.length}</b> likely to trip</span>
      <span class="t tight"><b>${groups.tight.length}</b> close to the limit</span>
      <span class="t ok"><b>${groups.ok.length}</b> fine</span>
    </div>
    ${known ? '' : '<div class="card empty"><p>No watts known yet. Add appliances like the fridge, microwave or a space heater on the Rooms tab and map them, and they’ll be checked here.</p></div>'}
    ${['over', 'tight'].map(k => groups[k].length ? `
      <h2 class="group-h ${k}">${HEAD[k][0]}${HEAD[k][1] ? ` <small>${HEAD[k][1]}</small>` : ''}</h2>
      <div class="loads">${groups[k].map(card).join('')}</div>` : '').join('')}
    ${groups.ok.length ? `<h2 class="group-h">Fine <small>Under 80% of what the breaker carries.</small></h2>
      <ul class="fine-list">${groups.ok.map(l => `<li><button type="button" data-c="${l.circuit.id}">
        <span class="bno">${M.circuitName(l.circuit)}</span>
        <span class="fl-name">${esc(M.labelOf(house, l.circuit) || 'Not mapped')}<small>${W(l.total)} of ${W(l.capacity)}</small></span>
        <span class="lbar ok"><i class="fill" style="width:${(Math.min(l.share, 1) * 100).toFixed(1)}%"></i><i class="eighty"></i></span>
      </button></li>`).join('')}</ul>` : ''}
    ${groups.unknown.length ? `<h2 class="group-h">No watts known</h2>
      <p class="hint unknown-list">${groups.unknown.map(l => `<button type="button" class="bno" data-c="${l.circuit.id}" aria-label="Breaker ${M.circuitName(l.circuit)}">${M.circuitName(l.circuit)}</button>`).join(' ')}</p>
      <p class="hint">Outlets and lights don’t count until you give them watts. ${plural(groups.unknown.length, 'breaker')} here.</p>` : ''}`;
  on({
    click(e) {
      const b = e.target.closest('[data-c]');
      if (b) breakerSheet(house, M.findCircuit(house, b.dataset.c), () => loadsScreen(house));
    },
  });
}

