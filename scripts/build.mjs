// Builds the film into single-file HTML.
//   dist/index.html     fully self-contained (three.js bundled) — open directly, used for video capture
//   dist/artifact.html  page fragment that loads three.js from jsDelivr (for hosted viewers)
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const THREE_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/three/package.json'), 'utf8')).version;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TITLE = 'CAR-T 细胞之旅';
const DESCRIPTION = 'CAR-T 细胞疗法科普动画：从 T 细胞采集、基因改造、扩增、静脉回输，到识别并杀伤肿瘤细胞。';

function fontFaces() {
  const dir = path.join(ROOT, 'assets/fonts');
  const mf = path.join(dir, 'fonts.json');
  if (!fs.existsSync(mf)) {
    console.warn('! assets/fonts/fonts.json missing — run `node scripts/fonts.mjs`; falling back to system fonts');
    return '';
  }
  return JSON.parse(fs.readFileSync(mf, 'utf8'))
    .map(({ family, weight, file }) => {
      const b64 = fs.readFileSync(path.join(dir, file)).toString('base64');
      return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
    })
    .join('\n');
}

// Keep `three` itself external for the CDN build but still bundle its addons.
const threeExternal = {
  name: 'three-external',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', external: true }));
  },
};

async function bundle(cdn) {
  const r = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/main.js')],
    bundle: true,
    write: false,
    format: cdn ? 'esm' : 'iife',
    minify: true,
    target: ['es2020', 'chrome90', 'safari15', 'firefox90'],
    legalComments: 'none',
    plugins: cdn ? [threeExternal] : [],
    logLevel: 'warning',
  });
  // A literal "</script" inside the bundle would end the inline script early.
  return r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

const css = read('src/styles.css');
const fonts = fontFaces();
const body = read('src/index.html');
const head = `<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}">
<style>
${fonts}
${css}
</style>`;

const inline = await bundle(false);
const full = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#010306">
${head}
</head>
<body>
${body.replace('<!--HEAD-->', '').replace('<!--SCRIPT-->', () => `<script>${inline}</script>`)}
</body>
</html>
`;

const esm = await bundle(true);
const importMap = JSON.stringify({ imports: { three: `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js` } });
const fragment = `${head}
${body
  .replace('<!--HEAD-->', '')
  .replace('<!--SCRIPT-->', () => `<script type="importmap">${importMap}</script>\n<script type="module">${esm}</script>`)}
`;

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/index.html'), full);
fs.writeFileSync(path.join(ROOT, 'dist/artifact.html'), fragment);
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`dist/index.html ${kb(full)}  ·  dist/artifact.html ${kb(fragment)}  ·  three@${THREE_VERSION}`);
