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

async function device() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
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
await page.goto(base);
await page.evaluate(() => document.fonts.ready);
assert.match(await text(page), /Map your breaker panel/);
await fits(page, 'the welcome screen');

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
await page.emulateMedia({ media: 'screen' });

// ---------- Send a read-only copy ----------
await page.click('#moreLink');
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
await page.click('[data-sample="back"]');
await page.locator('.door').waitFor();
assert.equal(await page.locator('.sample-banner').count(), 0);
assert.match(await page.locator('#houseName').innerText(), /Elm Street/);

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
