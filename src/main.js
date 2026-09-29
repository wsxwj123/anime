import { Renderer } from './engine/renderer.js';
import { buildTimeline, resolve, chapterAt } from './engine/timeline.js';
import { Overlay } from './engine/overlay.js';
import { CHAPTERS, UI } from './content.js';
import { SHOTS } from './scenes/index.js';
import { formatTime, clamp, lerp } from './engine/util.js';
import { Soundtrack } from './audio.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const POSTER_T = 5.2;

const ICONS = {
  play: 'M7 4.5v15l12.5-7.5z',
  pause: 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z',
  replay:
    'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',
  soundOn:
    'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  soundOff:
    'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z',
};

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// A shot parameter may be a constant or a function of local time.
const val = (shot, key, t, d) => {
  const v = shot[key];
  if (v == null) return d;
  return typeof v === 'function' ? v(t) : v;
};
const blendObj = (a, b, m) => {
  if (!b) return a;
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = lerp(a[k] ?? b[k], b[k] ?? a[k], m);
  return o;
};

async function boot() {
  const canvas = $('gl');
  if (CAPTURE) document.body.classList.add('capture');

  let renderer;
  try {
    renderer = new Renderer(canvas, { preserve: CAPTURE, samples: Number(params.get('msaa') ?? 4), dpr: 1 });
    if (params.has('grain')) renderer.grainScale = Number(params.get('grain'));
  } catch (e) {
    showError('当前浏览器无法启用 WebGL 2，请换用最新版 Chrome、Edge、Safari 或 Firefox 观看。');
    throw e;
  }

  // ---- build every shot up front (deterministic, no streaming) ----
  const ids = CHAPTERS.flatMap((c) => c.shots);
  const shots = {};
  for (let i = 0; i < ids.length; i++) {
    shots[ids[i]] = SHOTS[ids[i]]({ renderer });
    setLoading((i + 1) / (ids.length * 2));
    if (!CAPTURE) await nextFrame();
  }
  const tl = buildTimeline(CHAPTERS, shots);
  const overlay = new Overlay($('ov'), tl, { below: $('below-cap') });

  // ---- layout ----
  const stage = $('stage');
  const app = $('app');
  const controls = $('controls');
  let portrait = false;
  function layout() {
    let sw;
    let sh;
    let dpr;
    if (CAPTURE) {
      sw = Number(params.get('w') || 1920);
      sh = Math.round((sw * 9) / 16);
      dpr = Number(params.get('dpr') || 1);
    } else {
      const W = window.innerWidth;
      const H = window.innerHeight;
      portrait = W / H < 1.05;
      app.classList.toggle('portrait', portrait);
      if (portrait) {
        sw = W;
        sh = (W * 9) / 16;
        if (controls.parentNode !== app) app.insertBefore(controls, app.querySelector('.rotate-hint'));
      } else {
        sw = Math.min(W, (H * 16) / 9);
        sh = (sw * 9) / 16;
        if (controls.parentNode !== stage) stage.appendChild(controls);
      }
      const budget = 2.2e6 * quality;
      dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / (sw * sh)));
    }
    stage.style.setProperty('--sw', `${sw}px`);
    stage.style.setProperty('--sh', `${sh}px`);
    $('ov').style.setProperty('--k', String(sw / 1920));
    renderer.setSize(sw, sh, dpr);
  }
  let quality = 1;
  layout();

  // ---- shader warm-up so the first play does not hitch ----
  for (let i = 0; i < tl.shots.length; i++) {
    const s = tl.shots[i];
    s.update(Math.min(1, s.duration * 0.5));
    renderer.compile(s.scene, s.camera);
    setLoading(0.5 + (i + 1) / (tl.shots.length * 2));
    if (!CAPTURE) await nextFrame();
  }

  function renderAt(T) {
    T = clamp(T, 0, tl.total);
    const res = resolve(tl, T);
    res.a.update(res.at);
    if (res.b) res.b.update(res.bt);
    const A = res.a;
    const B = res.b;
    const m = res.mix;
    const pick = (k, d) => {
      const va = val(A, k, res.at, d);
      if (!B) return va;
      const vb = val(B, k, res.bt, d);
      return typeof va === 'number' ? lerp(va, vb, m) : blendObj(va, vb, m);
    };
    renderer.render({
      a: { scene: A.scene, camera: A.camera },
      b: B ? { scene: B.scene, camera: B.camera } : null,
      mix: m,
      mode: res.mode,
      exposure: pick('exposure', 1),
      bloom: pick('bloom', { strength: 0.8, radius: 0.55, threshold: 0.72 }),
      grade: pick('grade', { vignette: 0.55, sat: 1.05, grain: 0.035 }),
      flash: pick('flash', 0),
      fade: res.fade,
      time: T,
    });
    overlay.update(T, res);
    return res;
  }

  const sound = new Soundtrack(tl);

  // ---- capture API (used by scripts/render.mjs) ----
  window.__timeline = {
    total: tl.total,
    chapters: tl.chapters.map((c) => ({ id: c.id, start: c.start, end: c.end })),
    shotStarts: Object.fromEntries(tl.shots.map((s) => [s.id, s.start])),
  };
  window.__seek = (T) => {
    renderAt(T);
    return true;
  };
  window.__audio = async (sampleRate = 48000) => {
    window.__wav = await sound.renderOffline(sampleRate);
    return window.__wav.length;
  };
  window.__wavChunk = (off, len) => {
    const b = window.__wav.subarray(off, off + len);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  };
  // Render any shot in isolation (look development).
  const extra = {};
  window.__shot = (id, t) => {
    const s = shots[id] || (extra[id] ||= SHOTS[id]({ renderer }));
    s.update(t);
    renderer.render({
      a: { scene: s.scene, camera: s.camera },
      exposure: val(s, 'exposure', t, 1),
      bloom: val(s, 'bloom', t, { strength: 0.8, radius: 0.55, threshold: 0.72 }),
      grade: val(s, 'grade', t, { vignette: 0.55, sat: 1.05, grain: 0.035 }),
      fade: 1,
      time: t,
    });
    return true;
  };

  if (document.fonts && document.fonts.ready) {
    // Touch every glyph once so no face loads lazily mid-capture.
    await document.fonts.ready;
  }
  setLoading(1);
  $('loading').hidden = true;

  if (CAPTURE) {
    renderAt(0);
    window.__ready = true;
    return;
  }

  // ---- interactive player ----
  let T = POSTER_T;
  let playing = false;
  let last = 0;
  let started = false;
  let dirty = true;
  const poster = $('poster');
  poster.hidden = false;

  const segs = $('segs');
  const segFills = tl.chapters.map((ch) => {
    const s = document.createElement('div');
    s.className = 'seg';
    s.style.flex = `${ch.end - ch.start} 1 0`;
    const b = document.createElement('b');
    s.appendChild(b);
    segs.appendChild(s);
    return { ch, b };
  });

  const setIcon = (btn, d) => {
    btn.querySelector('svg').innerHTML = `<path d="${d}"/>`;
  };
  setIcon($('btn-play'), ICONS.play);
  setIcon($('btn-sound'), ICONS.soundOn);

  function syncUI() {
    for (const { ch, b } of segFills) b.style.transform = `scaleX(${clamp((T - ch.start) / (ch.end - ch.start)).toFixed(4)})`;
    $('time').textContent = `${formatTime(T)} / ${formatTime(tl.total)}`;
    const bar = $('bar');
    bar.setAttribute('aria-valuenow', String(Math.round((T / tl.total) * 100)));
    const ch = chapterAt(tl, T);
    const bc = $('below-chap');
    const txt = ch.num ? `${ch.num}　${ch.zh}<span>${ch.en}</span>` : '';
    if (bc.dataset.k !== ch.id) {
      bc.dataset.k = ch.id;
      bc.innerHTML = txt;
    }
    const ended = T >= tl.total - 0.001;
    const icon = playing ? ICONS.pause : ended ? ICONS.replay : ICONS.play;
    if ($('btn-play').dataset.icon !== icon) {
      $('btn-play').dataset.icon = icon;
      setIcon($('btn-play'), icon);
      $('btn-play').setAttribute('aria-label', playing ? UI.pause : ended ? UI.replay : UI.play);
    }
  }

  function play() {
    if (T >= tl.total - 0.05) T = 0;
    playing = true;
    started = true;
    poster.hidden = true;
    last = performance.now();
    sound.play(T);
    poke();
  }
  function pause() {
    playing = false;
    sound.pause();
    syncUI();
    poke();
  }
  function seek(t) {
    T = clamp(t, 0, tl.total);
    dirty = true;
    if (playing && !dragging) sound.play(T);
    syncUI();
  }
  const toggle = () => (playing ? pause() : play());

  $('bigplay').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!started) T = 0;
    play();
  });
  poster.addEventListener('click', () => {
    if (!started) T = 0;
    play();
  });
  $('btn-play').addEventListener('click', toggle);
  $('btn-sound').addEventListener('click', () => {
    const on = !sound.muted;
    sound.setMuted(on);
    $('btn-sound').setAttribute('aria-pressed', String(!on));
    setIcon($('btn-sound'), on ? ICONS.soundOff : ICONS.soundOn);
  });
  $('btn-full').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await app.requestFullscreen();
    } catch (e) {
      /* fullscreen is optional */
    }
  });
  stage.addEventListener('click', (e) => {
    if (!started || e.target.closest('#controls')) return;
    toggle();
  });

  // Scrubbing on the segmented bar.
  const bar = $('bar');
  const tip = $('tip');
  const tAtX = (x) => {
    const r = segs.getBoundingClientRect();
    return clamp((x - r.left) / r.width) * tl.total;
  };
  let dragging = false;
  bar.addEventListener('pointerdown', (e) => {
    dragging = true;
    if (playing) sound.pause();
    bar.setPointerCapture(e.pointerId);
    seek(tAtX(e.clientX));
    started = true;
    poster.hidden = true;
  });
  bar.addEventListener('pointermove', (e) => {
    const t = tAtX(e.clientX);
    if (dragging) seek(t);
    const ch = chapterAt(tl, t);
    tip.hidden = false;
    tip.textContent = ch.num ? `${ch.num} ${ch.zh}` : '片头';
    const r = segs.getBoundingClientRect();
    tip.style.left = `${clamp((e.clientX - r.left) / r.width) * 100}%`;
  });
  bar.addEventListener('pointerup', () => {
    dragging = false;
    if (playing) sound.play(T);
  });
  bar.addEventListener('pointerleave', () => (tip.hidden = true));
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') seek(T + 5);
    else if (e.key === 'ArrowLeft') seek(T - 5);
    else return;
    e.preventDefault();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('button, [role="slider"]') && e.key !== ' ') return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowRight') seek(T + 5);
    else if (e.key === 'ArrowLeft') seek(T - 5);
    else if (e.key === 'm') $('btn-sound').click();
    else if (e.key === 'f') $('btn-full').click();
  });

  // Auto-hide chrome while playing.
  let idleTimer = 0;
  const poke = () => {
    controls.classList.remove('hide');
    clearTimeout(idleTimer);
    if (playing && !portrait) idleTimer = setTimeout(() => controls.classList.add('hide'), 2600);
  };
  stage.addEventListener('pointermove', poke);
  controls.addEventListener('pointerenter', () => clearTimeout(idleTimer));
  controls.addEventListener('pointerleave', poke);
  controls.classList.remove('hide');

  window.addEventListener('resize', () => {
    layout();
    dirty = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) pause();
  });

  // Frame loop; also adapts resolution if the device struggles.
  let acc = 0;
  let frames = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (playing) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      T += dt;
      acc += dt;
      frames++;
      if (acc > 2.5) {
        const fps = frames / acc;
        if (fps < 34 && quality > 0.35) {
          quality *= 0.78;
          layout();
        }
        acc = 0;
        frames = 0;
      }
      if (T >= tl.total) {
        T = tl.total;
        pause();
        controls.classList.remove('hide');
      }
      dirty = true;
    }
    if (dirty) {
      renderAt(T);
      syncUI();
      dirty = false;
    }
  }
  renderAt(T);
  syncUI();
  requestAnimationFrame(tick);
}

function setLoading(p) {
  const b = $('loading-bar');
  if (b) b.style.transform = `scaleX(${p.toFixed(3)})`;
}
function showError(msg) {
  const e = $('err');
  e.hidden = false;
  e.textContent = msg;
  $('loading').hidden = true;
}

boot().catch((e) => {
  console.error(e);
  if ($('err').hidden) showError('场景加载失败，请刷新页面重试。');
});
