// Downloads glyph-subset fonts from Google Fonts for exactly the characters the
// film uses, so the build can embed them (a few hundred KB instead of MBs).
// Usage: node scripts/fonts.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'assets/fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const sources = walk(path.join(ROOT, 'src')).filter((f) => /\.(js|html)$/.test(f));
const chars = new Set();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
for (const f of sources) {
  const s = fs.readFileSync(f, 'utf8');
  // Only characters inside string literals / markup matter, but taking every
  // non-ASCII character in the sources is simpler and just as small.
  for (const ch of s) if (ch.codePointAt(0) > 0x7f) chars.add(ch);
}
const all = [...chars].sort().join('');
const latin = [...chars].filter((c) => c.codePointAt(0) < 0x2e80).join('');

const FACES = [
  { family: 'Noto Sans SC', weights: [300, 400, 500], text: all },
  { family: 'Noto Serif SC', weights: [600], text: all },
  { family: 'Jost', weights: [200, 400, 500], text: latin },
  { family: 'IBM Plex Mono', weights: [400], text: latin },
];

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const face of FACES) {
  for (const w of face.weights) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(face.family)}:wght@${w}&text=${encodeURIComponent(face.text)}&display=block`;
    const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('woff2'\)/);
    if (!m) throw new Error(`No woff2 for ${face.family} ${w}:\n${css.slice(0, 400)}`);
    const buf = Buffer.from(await (await fetch(m[1], { headers: { 'User-Agent': UA } })).arrayBuffer());
    const file = `${face.family.replace(/\s+/g, '')}-${w}.woff2`;
    fs.writeFileSync(path.join(OUT, file), buf);
    manifest.push({ family: face.family, weight: w, file });
    console.log(`${file}  ${(buf.length / 1024).toFixed(1)} KB`);
  }
}
fs.writeFileSync(path.join(OUT, 'fonts.json'), JSON.stringify(manifest, null, 2));
console.log(`${chars.size} characters`);
