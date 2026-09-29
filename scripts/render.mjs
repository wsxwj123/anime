// Frame-exact export, step 1: seek the film frame by frame in headless
// Chromium and save every frame as a JPEG. Resumable: existing frames are kept.
//   node scripts/render.mjs                      whole film → out/frames/
//   node scripts/render.mjs --from 60 --to 70    a range
//   options: --fps 30  --w 1920  --grain 0.3  --msaa 0  --out out/frames
// Step 2 (encoding) is scripts/encode.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i < 0 ? d : argv[i + 1];
};
const FPS = Number(opt('fps', 30));
const W = Number(opt('w', 1920));
const H = Math.round((W * 9) / 16);
const DIR = path.resolve(ROOT, opt('out', 'out/frames'));
fs.mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`file://${path.join(ROOT, 'dist/index.html')}?capture=1&w=${W}&msaa=${opt('msaa', 0)}&grain=${opt('grain', 0.3)}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const total = await page.evaluate(() => window.__timeline.total);
const F0 = Math.round(Number(opt('from', 0)) * FPS);
const F1 = Math.round(Math.min(total, Number(opt('to', total))) * FPS);
const name = (f) => path.join(DIR, `f${String(f).padStart(5, '0')}.jpg`);
const todo = [];
for (let f = F0; f < F1; f++) if (!fs.existsSync(name(f))) todo.push(f);
console.log(`${F1 - F0} frames in range, ${todo.length} to render at ${W}×${H}@${FPS}`);
const t0 = Date.now();
let n = 0;
for (const f of todo) {
  await page.evaluate((t) => window.__seek(t), f / FPS);
  const tmp = `${name(f)}.part`;
  await page.screenshot({ path: tmp, type: 'jpeg', quality: 95 });
  fs.renameSync(tmp, name(f));
  n++;
  if (n % 50 === 0 || n === todo.length) {
    const per = (Date.now() - t0) / n / 1000;
    console.log(`${n}/${todo.length} · frame ${f} (${(f / FPS).toFixed(1)} s) · ${per.toFixed(2)} s/frame · eta ${(((todo.length - n) * per) / 60).toFixed(1)} min`);
  }
}
await browser.close();
