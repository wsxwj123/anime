// Frame-exact export, step 2: encode out/frames/*.jpg + out/soundtrack.wav.
//   node scripts/encode.mjs                                   → out/cart-t-1080p.mp4, two-pass ~4 Mbps (fits under 100 MB)
//   node scripts/encode.mjs --crf 18 --name master            constant quality instead of a size target
//   node scripts/encode.mjs --name 720p --scale 1280 --bitrate 2200k
//   node scripts/encode.mjs --name hevc --codec h265 --bitrate 1280k --ab 96k   (< 30 MB; H.265 is ~2× as efficient)
// A light temporal denoise (hqdn3d) removes the film grain before encoding;
// at streaming bitrates grain otherwise turns into blotchy blocks.
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
const crf = opt('crf', null);
const bitrate = opt('bitrate', crf ? null : '3950k');
const scale = opt('scale', null);
const hasAudio = fs.existsSync(WAV) && !argv.includes('--no-audio');

const vf = [];
if (!argv.includes('--no-denoise')) vf.push('hqdn3d=1.5:1.5:6:6');
if (scale) vf.push(`scale=${scale}:-2:flags=lanczos`);
vf.push('format=yuv420p');
const input = ['-framerate', String(FPS), '-i', path.join(DIR, 'f%05d.jpg')];
const hevc = opt('codec', 'h264') === 'h265';
const video = hevc
  ? ['-vf', vf.join(','), '-c:v', 'libx265', '-preset', opt('preset', 'medium'), '-tag:v', 'hvc1', '-r', String(FPS)]
  : ['-vf', vf.join(','), '-c:v', 'libx264', '-preset', opt('preset', 'slow'), '-tune', 'film', '-profile:v', 'high', '-x264-params', 'aq-mode=3', '-r', String(FPS)];
const audio = hasAudio ? ['-c:a', 'aac', '-b:a', opt('ab', '160k'), '-shortest'] : [];
const run = (args) => execFileSync(FF, ['-y', '-loglevel', 'error', '-stats', ...args], { stdio: 'inherit' });

if (bitrate && hevc) {
  const stats = path.join(path.dirname(OUT), 'x265pass.log');
  run([...input, ...video, '-b:v', bitrate, '-x265-params', `pass=1:stats=${stats}:log-level=error`, '-an', '-f', 'mp4', '/dev/null']);
  run([...input, ...(hasAudio ? ['-i', WAV] : []), ...video, '-b:v', bitrate, '-x265-params', `pass=2:stats=${stats}:log-level=error`, ...audio, '-movflags', '+faststart', OUT]);
} else if (bitrate) {
  const log = path.join(path.dirname(OUT), 'x264pass');
  run([...input, ...video, '-b:v', bitrate, '-pass', '1', '-passlogfile', log, '-an', '-f', 'mp4', '/dev/null']);
  run([...input, ...(hasAudio ? ['-i', WAV] : []), ...video, '-b:v', bitrate, '-pass', '2', '-passlogfile', log, ...audio, '-movflags', '+faststart', OUT]);
} else {
  run([...input, ...(hasAudio ? ['-i', WAV] : []), ...video, '-crf', crf, ...audio, '-movflags', '+faststart', OUT]);
}
console.log(`→ ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
