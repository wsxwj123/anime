// Renders the soundtrack offline in headless Chromium → out/soundtrack.wav
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`file://${path.join(ROOT, 'dist/index.html')}?capture=1&w=640`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const t0 = Date.now();
const n = await page.evaluate(() => window.__audio(48000));
const parts = [];
const CH = 4 * 1024 * 1024;
for (let off = 0; off < n; off += CH) parts.push(Buffer.from(await page.evaluate(([o, l]) => window.__wavChunk(o, l), [off, CH]), 'base64'));
const wav = Buffer.concat(parts);
const file = path.join(OUT, 'soundtrack.wav');
fs.writeFileSync(file, wav);
console.log(`${file}  ${(wav.length / 1e6).toFixed(1)} MB  in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await browser.close();
