// Frame-exact export, step 2: encode out/frames/*.jpg + out/soundtrack.wav.
//   node scripts/encode.mjs                         → out/cart-t-1080p.mp4 (high quality, CRF 18)
//   node scripts/encode.mjs --name web --crf 23 --scale 1280   smaller variants
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i < 0 ? d : argv[i + 1];
};
const FF = process.env.FFMPEG || 'ffmpeg';
const FPS = Number(opt('fps', 30));
const DIR = path.resolve(ROOT, opt('frames', 'out/frames'));
const WAV = path.resolve(ROOT, opt('audio', 'out/soundtrack.wav'));
const OUT = path.resolve(ROOT, opt('out', `out/cart-t-${opt('name', '1080p')}.mp4`));
const scale = opt('scale', null);
const args = ['-y', '-loglevel', 'error', '-stats', '-framerate', String(FPS), '-i', path.join(DIR, 'f%05d.jpg')];
if (fs.existsSync(WAV)) args.push('-i', WAV);
const vf = ['format=yuv420p'];
if (scale) vf.unshift(`scale=${scale}:-2:flags=lanczos`);
args.push('-vf', vf.join(','), '-c:v', 'libx264', '-preset', opt('preset', 'slow'), '-tune', 'film', '-crf', opt('crf', '18'), '-profile:v', 'high', '-r', String(FPS));
if (opt('maxrate', null)) args.push('-maxrate', opt('maxrate'), '-bufsize', String(parseInt(opt('maxrate'), 10) * 2) + 'k');
if (fs.existsSync(WAV)) args.push('-c:a', 'aac', '-b:a', opt('ab', '192k'), '-shortest');
args.push('-movflags', '+faststart', OUT);
execFileSync(FF, args, { stdio: 'inherit' });
console.log(`→ ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
