// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// Uses the sample house, so the same pictures come out every time. Needs Playwright, and upng-js from `npm install`.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js');
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
await mkdir(join(root, 'docs'), { recursive: true });

// A 256-colour palette keeps the PNGs small.
async function save(shot, path) {
  const img = UPNG.decode(shot);
  await writeFile(join(root, path), Buffer.from(UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256)));
}

// The sample house, fixed to one date, without the sample banner.
async function open(viewport, deviceScaleFactor, hash = '#/panel') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: viewport.width < 800, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(() => {
    localStorage.clear();
    const h = window.breakerBox.sampleHouse(Date.UTC(2026, 8, 20, 15));
    h.sample = false;
    window.breakerBox.store.put(h);
  });
  await page.goto(base + hash);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  return page;
}

const scrollTo = (page, sel, pad = 70) => page.evaluate(([s, p]) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY - p), [sel, pad]);

// Phone screenshots for the README.
{
  const page = await open({ width: 390, height: 844 }, 2, '#/panel');
  await scrollTo(page, '.door', 66);
  await save(await page.screenshot(), 'docs/phone-panel.png');

  // Breaker 23 off, part way round the house.
  await page.goto(base + '#/map');
  await page.click('text=Start with breaker 23');
  await page.click('text=It’s off');
  await page.evaluate(() => {
    const { store, M } = window.breakerBox;
    const h = store.house();
    const byName = (room, name) => h.things.find(t => t.name === name && M.roomOf(h, t).name === room);
    M.toggleDead(h, byName('Living room', 'Outlet 4').id);
    M.toggleDead(h, byName('Bedroom 1', 'Outlet 3').id);
    store.put(h);
  });
  await page.reload();
  await page.locator('.walk-bar').waitFor();
  await page.evaluate(() => {
    const sec = document.querySelector('.walk-room:nth-child(3)');
    window.scrollTo(0, sec.getBoundingClientRect().top + scrollY - document.querySelector('.walk-head').getBoundingClientRect().height - 66);
  });
  await page.waitForTimeout(200);
  await save(await page.screenshot(), 'docs/phone-walk.png');
  await page.context().close();
}
{
  const page = await open({ width: 390, height: 844 }, 2, '#/loads');
  await page.waitForSelector('.card.load');
  await scrollTo(page, '.tally', 70);
  await page.waitForTimeout(100);
  await save(await page.screenshot(), 'docs/phone-loads.png');
  await page.context().close();
}

// The printed directory card and room list, as they come off the printer.
{
  const page = await open({ width: 1400, height: 900 }, 1, '#/print');
  await page.evaluate(() => {
    const area = document.getElementById('printArea');
    const card = area.querySelector('.card-page'), list = area.querySelector('.list-page');
    area.innerHTML = '';
    area.append(card, list);
    area.style.cssText = 'display:flex;gap:28px;align-items:flex-start;justify-content:center;padding:28px;background:var(--bg)';
    area.id = 'printShot'; // so the page doesn't re-fit the preview when the screenshot resizes the window
    card.style.zoom = list.style.zoom = '0.62';
  });
  const box = await page.locator('#printShot').boundingBox();
  await save(await page.screenshot({ clip: box, fullPage: true }), 'docs/print.png');
  await page.context().close();
}

// Link preview, 1200 x 630: the name and one line on the left, the app's own panel on the right.
{
  const page = await open({ width: 1200, height: 630 }, 1, '#/panel');
  await page.evaluate(async () => {
    const { store, M } = window.breakerBox;
    const h = store.house();
    const panel = h.panels[0];
    panel.spaces = 14;
    panel.circuits = panel.circuits.filter(c => M.spacesOf(c).every(s => s <= 14));
    const { panelDoor } = await import('./js/panel.js');
    const off = panel.circuits.find(c => c.space === 11).id;
    document.body.innerHTML = `<div class="ogcard">
      <div class="ogtext">
        <img src="icon.svg" alt="" width="76" height="76">
        <h1>Breaker Box</h1>
        <p>Map your breaker panel, one breaker at a time.</p>
        <ul><li>Flip it off, tap what went dead</li><li>Check what’s on each circuit</li><li>Print a directory for the door</li></ul>
      </div>
      <div class="ogdoor">${panelDoor(h, panel, { readOnly: true, hl: off, off, act: 'none' })}</div>
    </div>`;
    const style = document.createElement('style');
    style.textContent = `
      body { width: 1200px; height: 630px; overflow: hidden; background: var(--bg); }
      .ogcard { display: grid; grid-template-columns: 560px 1fr; align-items: center; height: 630px; padding: 0 60px 0 70px; gap: 40px; }
      .ogtext img { display: block; border-radius: 16px; }
      .ogtext h1 { font-size: 96px; font-stretch: 82%; letter-spacing: -.03em; margin: 24px 0 12px; white-space: nowrap; line-height: 1; }
      .ogtext p { font-size: 32px; line-height: 1.25; color: var(--ink-2); margin: 0 0 26px; font-weight: 550; }
      .ogtext ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
      .ogtext li { font-size: 24px; font-weight: 650; color: var(--muted); display: flex; align-items: center; gap: 14px; }
      .ogtext li::before { content: ''; width: 18px; height: 12px; border-radius: 3px; background: #18191b; box-shadow: inset 0 0 0 2px #3b3e42; }
      .ogtext li:nth-child(2)::before { background: var(--yellow); box-shadow: inset 0 0 0 2px #18191b; }
      .ogdoor { transform: rotate(-1.5deg); }
      .ogdoor .door { --row: 58px; --h: 46px; --n: 24px; --sp: 16px; padding: 16px 14px 14px; }
      .ogdoor .lbl { font-size: 17px; }
      .ogdoor .main-brk { display: none; }`;
    document.head.append(style);
    await document.fonts.ready;
  });
  await page.waitForTimeout(200);
  await save(await page.screenshot(), 'og.png');
  await page.context().close();
}

await browser.close();
server.close();
console.log('screenshots written');
