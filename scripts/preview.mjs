// Renders still frames for review.
//   node scripts/preview.mjs 1.5 4 8.2            global times (seconds)
//   node scripts/preview.mjs --shot collect 0 4 9  times relative to a shot's start
//   node scripts/preview.mjs --every 6             one frame every 6 s, plus a contact sheet
// Options: --w 1280 (frame width), --out out/preview, --sheet name
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const W = Number(opt('w', 1280));
const OUT = path.resolve(ROOT, opt('out', 'out/preview'));
const shotId = opt('shot', null);
const solo = opt('solo', null);
const every = opt('every', null);
const sheet = opt('sheet', every ? 'sheet' : null);
const cols = Number(opt('cols', 4));
fs.mkdirSync(OUT, { recursive: true });

export async function launch(width) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-driver-bug-workarounds'],
  });
  const page = await browser.newPage({ viewport: { width, height: Math.round((width * 9) / 16) }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.error(`console.${m.type()}:`, m.text());
  });
  const url = `file://${path.join(ROOT, 'dist/index.html')}?capture=1&w=${width}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  return { browser, page };
}

const { browser, page } = await launch(W);
const info = await page.evaluate(() => window.__timeline);
let times = args.map(Number).filter((x) => !Number.isNaN(x));
let base = 0;
if (shotId) {
  base = info.shotStarts[shotId];
  if (base == null) throw new Error(`unknown shot ${shotId}`);
}
if (every) {
  times = [];
  for (let t = 0.5; t < info.total; t += Number(every)) times.push(Number(t.toFixed(2)));
}
const files = [];
const t0 = Date.now();
for (const t of times) {
  const T = base + t;
  if (solo) await page.evaluate(([id, x]) => window.__shot(id, x), [solo, t]);
  else await page.evaluate((x) => window.__seek(x), T);
  const tag = solo || shotId;
  const f = path.join(OUT, `${tag ? `${tag}_` : ''}${(solo ? t : T).toFixed(2).padStart(7, '0')}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 90 });
  files.push(f);
  console.log(f);
}
console.log(`${times.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s (total ${info.total.toFixed(1)} s)`);
await browser.close();

if (sheet && files.length) {
  const ff = process.env.FFMPEG || 'ffmpeg';
  const rows = Math.ceil(files.length / cols);
  const list = path.join(OUT, 'sheet.txt');
  fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
  const out = path.join(OUT, `${sheet}.jpg`);
  execFileSync(ff, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:-1,tile=${cols}x${rows}:padding=4:color=0x202020`, '-frames:v', '1', '-q:v', '3', out]);
  console.log(out);
}
