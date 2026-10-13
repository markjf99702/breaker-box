// Uses the app in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// Sets up a panel, lists two rooms, maps breakers the way you would in the basement, finds one outlet's breaker,
// checks the loads, searches, prints, sends a read-only copy to a second phone, backs up and restores,
// tries the sample house, and ends with the checks every project wants.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
const problems = [];

async function device(extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, ...extra });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('requestfailed', r => problems.push('failed: ' + r.url()));
  page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });
  return { ctx, page };
}

const fits = async (page, where) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${where} scrolls sideways on a phone`);
const text = page => page.locator('main').innerText();
const breaker = (page, name) => page.locator(`.brk[aria-label^="Breaker ${name},"]`);
const closeSheet = async page => { await page.click('#sheet .sheet-x'); await page.locator('#sheet').waitFor({ state: 'hidden' }); };
const tab = async (page, name) => { await page.click(`.tabs a[data-tab="${name}"]`); await page.waitForTimeout(150); };

// ---------- Set up the panel ----------
const me = await device();
const page = me.page;
// Every tool at junkdrawer.works/… shares one address, and so one set of offline copies. Before Breaker Box first
// loads, put another tool's copy there, and an old one of Breaker Box's own, from a page on the same address.
const CACHE = (await readFile(join(root, 'sw.js'), 'utf8')).match(/const CACHE = '([^']+)'/)[1];
const neighbour = await me.ctx.newPage();
await neighbour.goto(base + 'another-tool');
await neighbour.evaluate(async () => {
  await (await caches.open('every-so-often-v4')).put('every-so-often/', new Response('another tool'));
  await (await caches.open('breaker-box-v0')).put('breaker-box/', new Response('an old copy'));
});
await neighbour.close();
await page.goto(base);
await page.evaluate(() => document.fonts.ready);
assert.match(await text(page), /Map your breaker panel/);
await fits(page, 'the welcome screen');
// Load a backup can be reached from the keyboard, and shows where the focus is.
for (let i = 0; i < 12 && await page.evaluate(() => document.activeElement.id) !== 'loadBackup'; i++) await page.keyboard.press('Tab');
assert.equal(await page.evaluate(() => document.activeElement.id), 'loadBackup', 'Tab reaches Load a backup');
assert.notEqual(await page.locator('label:has(#loadBackup)').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'with a ring round it');

await page.click('text=Set up my panel');
await page.locator('#setup').waitFor();
await page.fill('#hName', 'Elm Street');
await page.fill('#pWhere', 'Basement');
await page.click('.seg[data-name="spaces"] button[data-v="20"]');
await page.click('[data-step="2"]');
await page.click('[data-step="-2"]');
assert.equal(await page.locator('#spacesOut').innerText(), '20');
await page.click('.seg[data-name="main"] button[data-v="100"]');
await fits(page, 'setting up');
await page.click('text=Make the panel');
await page.locator('.door').waitFor();
assert.equal(await page.locator('.door .brk').count(), 20, 'a 15 A breaker in each of 20 spaces');
assert.match(await page.locator('.door').innerText(), /Main 100\sA/);
assert.deepEqual(await page.locator('.num.left').allInnerTexts(), ['1', '3', '5', '7', '9', '11', '13', '15', '17', '19'], 'odd numbers down the left');
await fits(page, 'the panel');

// Breaker 1 is 20 A; 5 is a 30 A double-pole, which takes space 7; 3 is GFCI.
await breaker(page, 1).click();
await page.click('#sheet .seg[data-name="amps"] button[data-v="20"]');
await closeSheet(page);
assert.equal(await breaker(page, 1).locator('.hdl b').innerText(), '20');
await breaker(page, 5).click();
await page.click('#sheet .seg[data-name="poles"] button[data-v="double"]');
await page.click('#sheet .seg[data-name="amps"] button[data-v="30"]');
assert.match(await page.locator('#sheet .sheet-h').innerText(), /Breaker 5\/7/);
await closeSheet(page);
assert.equal(await page.locator('.door .brk').count(), 19, 'the breaker in 7 made way');
assert.equal(await breaker(page, '5/7').count(), 1);
await breaker(page, 3).click();
await page.click('#sheet .seg[data-name="kind"] button[data-v="gfci"]');
await page.mouse.click(195, 12); // tapping outside the sheet closes it too
await page.locator('#sheet').waitFor({ state: 'hidden' });
assert.match(await breaker(page, 3).innerText(), /GFCI/);

// ---------- The rooms and what's in them ----------
await tab(page, 'rooms');
await page.click('.chip[data-room="Kitchen"]');
await page.click('.chip[data-room="Bedroom 1"]');
const room = name => page.locator('.room', { has: page.locator('h2', { hasText: name }) });
await room('Kitchen').locator('[data-quick$=":outlet"]').click();
await room('Kitchen').locator('[data-quick$=":outlet"]').click();
await room('Kitchen').locator('[data-quick$=":appliance"]').click();
await page.click('#sheet [data-app="Fridge"]');
await page.click('#sheet [data-app="Microwave"]');
await page.click('#sheet .sheet-actions [data-close]');
await page.locator('#sheet').waitFor({ state: 'hidden' });
await page.waitForTimeout(100);
await room('Bedroom 1').locator('[data-quick$=":light"]').click();
await room('Bedroom 1').locator('[data-quick$=":outlet"]').click();
await room('Bedroom 1').locator('[data-quick$=":appliance"]').click();
await page.click('#sheet [data-app="Space heater"]');
await page.click('#sheet .sheet-actions [data-close]');
await page.locator('#sheet').waitFor({ state: 'hidden' });
await page.waitForTimeout(100);
assert.deepEqual(await room('Kitchen').locator('.tname').evaluateAll(els => els.map(e => e.textContent)), ['Outlet 1', 'Outlet 2', 'Fridge700\u00a0W', 'Microwave1,500\u00a0W']);
// Name an outlet.
await room('Bedroom 1').locator('.trow', { hasText: 'Outlet 1' }).click();
await page.click('#sheet .chip[data-place="By the bed"]');
await page.click('#sheet .seg[data-name="tkind"] button[data-v="outlet"]'); // choosing the kind leaves the name alone
await closeSheet(page);
assert.match(await room('Bedroom 1').innerText(), /By the bed/);
await fits(page, 'the rooms');

// ---------- Map it: breaker by breaker ----------
await tab(page, 'map');
assert.match(await text(page), /Next: breaker 1/);
await page.click('text=Start with breaker 1');
assert.match(await page.locator('.say').innerText(), /Flip breaker 1 off/);
assert.equal(await page.locator('.mini .m-h.me').count(), 1, 'the little panel shows where it is');
await page.click('text=It’s off');
assert.equal(await page.locator('.tabs').isVisible(), false, 'the tabs make room while walking round');
const walkRoom = name => page.locator('.walk-room', { has: page.locator('h2', { hasText: name }) });
await walkRoom('Kitchen').locator('.thing', { hasText: 'Outlet 1' }).click();
await walkRoom('Kitchen').locator('.thing', { hasText: 'Outlet 2' }).click();
await walkRoom('Kitchen').locator('.thing', { hasText: 'Fridge' }).click();
await walkRoom('Kitchen').locator('.thing', { hasText: 'Outlet 2' }).click(); // not that one after all
await walkRoom('Kitchen').locator('.thing', { hasText: 'Outlet 2' }).click(); // yes, that one
await walkRoom('Kitchen').locator('[data-add$=":light"]').click(); // found a light nobody listed
assert.equal(await page.locator('#deadCount').innerText(), '4 things dead');
assert.equal(await walkRoom('Kitchen').locator('.thing.dead').count(), 4);
await fits(page, 'walking round');
await page.click('.walk-bar .btn.primary');
assert.match(await page.locator('.say').innerText(), /Turn breaker 1 back on/);
assert.match(await page.locator('.found-card').innerText(), /4 things/);
assert.equal(await page.locator('#fLabel').getAttribute('placeholder'), 'Kitchen outlets, light, fridge', 'the label writes itself');
await page.click('text=Next: breaker 2');
await page.click('text=It’s off');
await page.click('.walk-bar .btn.primary'); // nothing went dead
assert.match(await text(page), /Nothing went dead on 2/);
await page.fill('#fLabel', 'Spare');
await page.click('text=Done for now');
assert.match(await text(page), /Next: breaker 3/);
assert.match(await text(page), /2 of 19 breakers mapped/);
assert.match(await text(page), /4 things not found yet/);

// ---------- Find one thing's breaker ----------
await page.click('.pick-list button:has-text("Microwave")');
assert.match(await text(page), /Plug in a lamp|Switch it on/);
const first = await page.locator('[data-still]').getAttribute('data-still');
await page.click('[data-still]');
assert.match(await page.locator('.try-card .say').innerText(), /Turn \d+ back on, then flip \d+ off/);
assert.notEqual(await page.locator('[data-went]').getAttribute('data-went'), first);
await page.click('[data-act="pick"]');
await page.locator('#sheet .brk[aria-label^="Breaker 4,"]').click();
assert.match(await page.locator('.say').innerText(), /Microwave is on breaker 4/);
await fits(page, 'finding a breaker');
await page.click('text=Done');

// ---------- Loads ----------
// The space heater goes on 4 as well: 1,500 W and 1,500 W on a 15 A breaker.
await tab(page, 'rooms');
await room('Bedroom 1').locator('.trow', { hasText: 'Space heater' }).click();
await page.selectOption('#tCircuit', { label: '4 · 15 A · Kitchen microwave' });
await closeSheet(page);
assert.equal(await room('Bedroom 1').locator('.trow', { hasText: 'Space heater' }).locator('.bno').innerText(), '4');
await tab(page, 'loads');
assert.match(await page.locator('.group-h.over').innerText(), /Likely to trip/);
const trip = await page.locator('.card.load.over').innerText();
assert.match(trip, /3,000\sW/);
assert.match(trip, /1,800\sW/);
assert.match(trip, /will likely trip/);
assert.match(await text(page), /licensed electrician/);
await fits(page, 'the load check');

// ---------- Search ----------
await page.click('#searchLink');
await page.fill('#q', 'fridge');
assert.equal(await page.locator('.res .bno').first().innerText(), '1');
await page.fill('#q', 'bed heater');
assert.match(await page.locator('#results').innerText(), /Space heater/);
await page.fill('#q', 'nothing like this');
assert.match(await page.locator('#results').innerText(), /Nothing called that/);

// ---------- The panel afterwards ----------
await tab(page, 'panel');
assert.match(await breaker(page, 1).innerText(), /Kitchen/);
assert.match(await breaker(page, 2).innerText(), /Spare/);
assert.match(await breaker(page, 4).innerText(), /Kitchen microwave; Bedroom 1 space heater/);
assert.equal(await page.locator('.brk.unmapped').count(), 16);

// ---------- Print ----------
await tab(page, 'print');
assert.equal(await page.locator('.pcard').count(), 1);
assert.match(await page.locator('.pcard').innerText(), /MAIN PANEL/i);
assert.match(await page.locator('.plist').innerText(), /By the bed/);
await page.click('.seg[data-name="size"] button[data-v="4x6"]');
const card = await page.locator('.pcard').evaluate(el => [el.style.width, el.style.height]);
assert.deepEqual(card, ['4in', '6in']);
const overflow = await page.locator('.pcard .pc').evaluateAll(els => els.filter(el => el.scrollHeight > el.clientHeight + 1).length);
assert.equal(overflow, 0, 'every label fits the card');
await fits(page, 'the print preview');
const pdf = await page.pdf({ format: 'Letter', printBackground: true });
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
assert.equal(pdf.toString('latin1').match(/\/Type \/Page\b/g).length, 2, 'the card on one page, the room list on the next');
await page.emulateMedia({ media: 'print' });
assert.equal(await page.locator('.bar').isVisible(), false, 'the top bar doesn’t print');
assert.equal(await page.locator('.print-controls').isVisible(), false);
await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light', 'a phone in dark mode prints on white, margins too');
await page.emulateMedia({ media: 'screen', colorScheme: 'light' });

// ---------- Send a read-only copy ----------
await page.click('#moreLink');
await page.locator('#loadBackup').waitFor({ state: 'attached' });
assert.ok(await page.evaluate(() => { const input = document.getElementById('loadBackup'); input.focus(); return document.activeElement === input; }), 'Load a backup on More takes the keyboard too');
await page.click('[data-act="share"]');
await page.fill('#shName', 'Mark');
await page.waitForFunction(() => document.querySelector('#shLink').value.includes('#/view/z'));
const link = await page.locator('#shLink').inputValue();
assert.ok(link.startsWith(base + '#/view/'), 'the link points back to this page');
await page.click('#shCopy');
await page.locator('#toast', { hasText: 'Link copied' }).waitFor();
assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link, 'Copy link copies it');
await closeSheet(page);

const them = await device();
await them.page.goto(link);
await them.page.locator('.view-door').waitFor();
assert.match(await them.page.locator('.sample-banner').innerText(), /Mark’s map of Elm Street/);
assert.equal(await them.page.locator('.tabs').isVisible(), false, 'nothing to change in a read-only copy');
await them.page.fill('#q', 'microwave');
assert.equal(await them.page.locator('.res .bno').first().innerText(), '4');
await them.page.locator('.brk[aria-label^="Breaker 1,"]').click();
assert.match(await them.page.locator('#sheet').innerText(), /Outlet 1/);
await closeSheet(them.page);
await fits(them.page, 'the read-only copy');
await them.page.click('[data-act="keep"]');
await them.page.locator('.door').waitFor();
assert.equal(await them.page.locator('.door .brk').count(), 19, 'kept on their phone');
assert.match(await them.page.locator('#houseName').evaluate(el => el.textContent), /Elm Street/);

// ---------- Backup and restore ----------
const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="save"]')]);
const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
assert.equal(saved.app, 'breaker-box');
assert.equal(saved.houses.length, 1);
assert.equal(saved.houses[0].things.length, 8);
const fresh = await device();
await fresh.page.goto(base);
const file = join(await mkdtemp(join(tmpdir(), 'breaker-box-')), 'backup.json');
await writeFile(file, JSON.stringify(saved));
await fresh.page.setInputFiles('#loadBackup', file);
await fresh.page.locator('.door').waitFor();
assert.match(await fresh.page.locator('.prog').innerText(), /3 of 19 breakers mapped/);
await fresh.ctx.close();

// ---------- The sample house ----------
await page.click('[data-act="sample"]');
await page.locator('.sample-banner').waitFor();
assert.match(await page.locator('.ptabs').innerText(), /Garage subpanel/);
assert.equal(await page.locator('.door .brk.feeder').count(), 1, 'the breaker that feeds the garage');
await page.click('.ptabs a:has-text("Garage subpanel")');
await page.locator('.plate', { hasText: 'Garage subpanel' }).waitFor();
assert.match(await page.locator('.door').innerText(), /Fed from 29\/31/);
await tab(page, 'loads');
assert.match(await page.locator('.card.load.over').innerText(), /Office/);
await fits(page, 'the sample house');
await page.click('#moreLink');
const [tagWide, nameWide] = await page.locator('.houses .res.here').evaluate(el => [el.querySelector('.tag'), el.querySelector('span:not(.tag)')].map(x => x.getBoundingClientRect().width));
assert.ok(tagWide < 80 && nameWide > 180, `the Open tag stays small beside the house's name: ${tagWide} and ${nameWide} px`);
await page.click('[data-sample="back"]');
await page.locator('.door').waitFor();
assert.equal(await page.locator('.sample-banner').count(), 0);
assert.match(await page.locator('#houseName').innerText(), /Elm Street/);

// ---------- Changing the panel part way through mapping ----------
// On a second phone with the sample house: removing the breaker a search just landed on sends it back to trying
// the rest, rather than leaving Map it blank.
const rev = await device();
const rp = rev.page;
await rp.goto(base + '#/sample');
await rp.locator('.door').waitFor();
await tab(rp, 'map');
await rp.click('.pick-list button:has-text("Dehumidifier")');
await rp.click('[data-went]');
assert.match(await rp.locator('.say').innerText(), /Dehumidifier is on breaker 23\./);
await tab(rp, 'panel');
await breaker(rp, 23).click();
await rp.click('#bRemove');
await tab(rp, 'map');
assert.match(await rp.locator('.try-card .say').innerText(), /^Flip breaker \S+ off\.$/, 'trying the next breaker');
await rp.reload();
await rp.locator('.try-card').waitFor();
// One already saved pointing at a breaker that's gone opens at the trying step too.
await rp.evaluate(() => { const h = breakerBox.store.house(); h.session.step = 'found'; h.session.found = 'gone'; });
await tab(rp, 'rooms');
await tab(rp, 'map');
assert.match(await rp.locator('.try-card .say').innerText(), /^Flip breaker \S+ off\.$/);
await rp.click('[data-act="stop"]');

// Making the panel smaller asks before dropping anything known about, each time: first the garage's feeder,
// which has nothing of its own on it, then each mapped breaker in turn.
await tab(rp, 'panel');
await rp.click('[data-act="settings"]');
const fewer = async () => { await rp.click('#sheet [data-step="-2"]'); return rp.locator('#pSpaces').innerText(); };
const toastText = () => rp.locator('#toast').innerText();
assert.equal(await fewer(), '32');
assert.match(await toastText(), /^That would drop breaker 29\/31, which feeds Garage subpanel\. Tap again/);
assert.equal(await fewer(), '30');
assert.equal(await fewer(), '30');
assert.match(await toastText(), /^That would drop breaker 30 and what’s known about it\./);
assert.equal(await fewer(), '28');
assert.equal(await fewer(), '28');
assert.match(await toastText(), /breaker 25\/27/);
assert.equal(await fewer(), '26');
assert.equal(await fewer(), '26', 'asks again for the next one');
assert.match(await toastText(), /breaker 26 /);
await closeSheet(rp);

// A tandem that can't be made double-pole stays a tandem: the garage's 1, with the freezer on 3 below it.
await rp.click('.ptabs a:has-text("Garage subpanel")');
await rp.locator('.plate', { hasText: 'Garage subpanel' }).waitFor();
await breaker(rp, 1).click();
await rp.click('#sheet .seg[data-name="poles"] button[data-v="tandem"]');
await closeSheet(rp);
await breaker(rp, '1B').click();
await rp.fill('#bLabel', 'Shed');
await closeSheet(rp);
await breaker(rp, '1A').click();
await rp.click('#sheet .seg[data-name="poles"] button[data-v="double"]');
assert.match(await toastText(), /^Breaker 3 has things on it\./);
assert.match(await rp.locator('#sheet .sheet-h').innerText(), /^Breaker 1A/);
await closeSheet(rp);
assert.match(await breaker(rp, '1B').innerText(), /Shed/, 'still two in one space, with its label');

// Things on a subpanel's breakers say which panel, so the garage's 3 doesn't read as the main panel's 3.
await breaker(rp, 5).click();
await rp.click('#bAdd');
const tileState = name => rp.locator('#sheet .thing', { hasText: name }).locator('.st').textContent();
assert.equal(await tileState('Freezer'), 'On Garage 3');
await rp.locator('#sheet .thing', { hasText: 'Floodlight' }).click();
assert.equal(await tileState('Floodlight'), '✓ on Garage 5');
await rp.click('#sheet .sheet-actions [data-close]');
await closeSheet(rp);

// What a breaker feeding a subpanel says when the things that run for hours are on the subpanel, on both, or only on it.
const feederLines = await rp.evaluate(async () => {
  const { M } = window.breakerBox;
  const { loadLine } = await import('./js/loads.js');
  const h = M.blankHouse('Shop');
  const feeder = M.addPanel(h, { spaces: 12, fill: 15 }).circuits[0];
  M.setPoles(h, feeder, 2);
  feeder.amps = 30;
  const shop = M.addPanel(h, { name: 'Shop subpanel', spaces: 4, fill: 20, fedBy: feeder.id });
  const room = M.addRoom(h, 'Shop');
  M.addThing(h, room.id, { kind: 'appliance', name: 'Water heater', watts: 4500, volts: 240, hours: true, circuitId: shop.circuits[0].id });
  const heater = M.addThing(h, room.id, { kind: 'appliance', name: 'Space heater', watts: 1500, hours: true, circuitId: shop.circuits[1].id });
  const out = [loadLine(h, M.loadOf(h, feeder))];
  feeder.amps = 50;
  heater.circuitId = null;
  M.addThing(h, room.id, { kind: 'appliance', name: 'Hot tub', watts: 6000, volts: 240, hours: true, circuitId: feeder.id });
  out.push(loadLine(h, M.loadOf(h, feeder)));
  feeder.amps = 30;
  Object.assign(h.things.find(t => t.name === 'Water heater'), { watts: 1000, hours: false });
  out.push(loadLine(h, M.loadOf(h, feeder)));
  return out;
});
assert.deepEqual(feederLines, [
  'Things on Shop subpanel that run for hours come to 6,000\u00a0W. The usual guideline keeps that under 80% of the breaker, 5,760\u00a0W here.',
  'Things that run for hours, on it and on Shop subpanel, come to 10,500\u00a0W. The usual guideline keeps that under 80% of the breaker, 9,600\u00a0W here. That includes 4,500\u00a0W on Shop subpanel.',
  'Hot tub runs for hours at a time, 6,000\u00a0W. The usual guideline keeps that under 80% of the breaker, 5,760\u00a0W here.',
]);

// Making a tandem's B half a single breaker brings A's things over, and says they came from A.
await breaker(rp, '1B').click();
await rp.click('#sheet .seg[data-name="poles"] button[data-v="single"]');
assert.equal(await toastText(), 'Moved 2 things from 1A onto 1.');
await closeSheet(rp);
assert.match(await breaker(rp, 1).innerText(), /Shed/);

// ---------- Jumping to a room while a breaker is off ----------
// The room's heading lands just below the header that sticks at the top, and with reduced motion it jumps straight there.
const still = await device({ reducedMotion: 'reduce' });
const sw = still.page;
await sw.goto(base + '#/sample');
await sw.locator('.door').waitFor();
await tab(sw, 'map');
await sw.click('.flip-card [data-flip]');
await sw.click('text=It’s off');
const jump = await sw.evaluate(async () => {
  const chip = [...document.querySelectorAll('.jump a')].find(a => a.textContent.trim() === 'Office');
  chip.click();
  const right = scrollY;
  await new Promise(r => setTimeout(r, 800));
  const summary = document.querySelector(`${chip.getAttribute('href')} summary`).getBoundingClientRect();
  return { right, after: scrollY, head: document.querySelector('.walk-head').getBoundingClientRect().bottom, room: summary.top };
});
assert.equal(jump.right, jump.after, 'straight there, without scrolling smoothly');
assert.ok(jump.room >= jump.head && jump.room < jump.head + 20, `the Office heading is just below the header: ${JSON.stringify(jump)}`);
await sw.click('.walk-head [data-act="stop"]');
await still.ctx.close();

// ---------- Printing a subpanel added later ----------
// Print remembers the card size, but every panel is ticked each visit, including one added since the last.
const sub = await device();
const sp = sub.page;
await sp.goto(base);
await sp.click('text=Set up my panel');
await sp.click('text=Make the panel');
await sp.locator('.door').waitFor();
await tab(sp, 'print');
await sp.click('.seg[data-name="size"] button[data-v="4x6"]');
await tab(sp, 'panel');
await sp.click('.ptabs a.add');
await sp.click('text=Add the subpanel');
await sp.locator('.plate', { hasText: 'Subpanel' }).waitFor();
await tab(sp, 'print');
assert.equal(await sp.locator('.pcard').count(), 2, 'the new subpanel prints too');
assert.deepEqual(await sp.locator('[data-panel]').evaluateAll(els => els.map(e => e.checked)), [true, true]);
await sp.reload();
await sp.locator('.pcard').first().waitFor();
assert.equal(await sp.locator('.pcard').count(), 2, 'after a reload too');
assert.equal(await sp.locator('.pcard').first().evaluate(el => el.style.width), '4in', 'the card size is remembered');
await sub.ctx.close();

// Survives a reload, a flip test survives a reload part way, and it works offline once it has been opened.
await tab(page, 'map');
await page.click('text=Start with breaker 3');
await page.click('text=It’s off');
await walkRoom('Bedroom 1').locator('.thing', { hasText: 'Light 1' }).click();
await page.reload();
await page.locator('.walk-bar').waitFor();
assert.equal(await page.locator('#deadCount').innerText(), '1 thing dead', 'part way through, after a reload');
await page.click('.walk-head [data-act="stop"]');
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
assert.deepEqual(await page.evaluate(names => Promise.all(names.map(n => caches.has(n))), ['every-so-often-v4', 'breaker-box-v0', CACHE]),
  [true, false, true], 'the offline copy clears out only its own old caches, never another tool’s');
await me.ctx.setOffline(true);
await page.goto(base + '#/panel');
await page.reload();
await page.locator('.door').waitFor();
assert.match(await page.locator('.door').innerText(), /Kitchen/, 'loads offline');
await me.ctx.setOffline(false);

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
