import * as THREE from 'three';
import { envelope, smoothstep, clamp, prog, ease, invLerp } from './util.js';
import { ACTS, TITLE, END } from '../content.js';

const W = 1920;
const H = 1080;
const SVGNS = 'http://www.w3.org/2000/svg';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
const svg = (tag, attrs, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
export const markup = (s) => s.replace(/\*(.+?)\*/g, '<em>$1</em>');

const _v = new THREE.Vector3();

// Everything drawn over the 3D image, laid out in a fixed 1920×1080 design
// space and scaled with the stage. Every property is a function of time.
export class Overlay {
  constructor(root, tl, { below = null } = {}) {
    this.root = root;
    this.tl = tl;
    this.below = below;
    root.innerHTML = '';

    this.scrim = el('div', 'ov-scrim', root);
    this.lines = svg('svg', { class: 'ov-lines', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, root);
    this.labelLayer = el('div', 'ov-labels', root);

    // Labels (one DOM node per definition, reused every frame).
    this.labels = [];
    for (const shot of tl.shots) {
      for (const def of shot.labels || []) {
        const g = svg('g', { class: 'lbl-g' }, this.lines);
        const diag = svg('line', { class: 'lbl-line' }, g);
        const hor = svg('line', { class: 'lbl-line' }, g);
        const tick = svg('line', { class: 'lbl-line' }, g);
        const ring = svg('circle', { class: 'lbl-ring', r: 9 }, g);
        const dot = svg('circle', { class: 'lbl-dot', r: 4.2 }, g);
        const box = el('div', 'lbl', this.labelLayer);
        const zh = el('div', 'lbl-zh', box, def.zh);
        const en = def.en ? el('div', 'lbl-en', box, def.en) : null;
        if (def.color) {
          dot.style.fill = def.color;
          ring.style.stroke = def.color;
        }
        g.style.display = 'none';
        box.style.display = 'none';
        if (def.type === 'bracket') {
          ring.style.display = 'none';
          dot.style.display = 'none';
          box.classList.add('brk');
        }
        this.labels.push({ shot, def, g, diag, hor, tick, ring, dot, box, zh, en, on: false });
      }
    }

    // Chapter heading, one per numbered chapter.
    this.chapterEls = [];
    for (const ch of tl.chapters) {
      if (!ch.num) continue;
      const act = ACTS[ch.act];
      const box = el('div', 'chap', root);
      el('div', 'chap-act', box, `<span>${act.en}</span><i></i><span>${act.zh}</span>`);
      const row = el('div', 'chap-row', box);
      const num = el('div', 'chap-num', row, ch.num);
      el('div', 'chap-bar', row);
      const names = el('div', 'chap-names', row);
      el('div', 'chap-zh', names, ch.zh);
      el('div', 'chap-en', names, ch.en);
      this.chapterEls.push({ ch, box, num, names });
    }

    // Process map: every numbered chapter as a node on a hairline.
    this.map = el('div', 'map', root);
    const numbered = tl.chapters.filter((c) => c.num);
    this.mapNodes = numbered.map((ch, i) => {
      const n = el('div', 'map-node', this.map);
      n.style.left = `${(i / (numbered.length - 1)) * 100}%`;
      el('i', '', n);
      if (i === 0 || numbered[i - 1].act !== ch.act) {
        const a = el('div', 'map-act', n, ACTS[ch.act].short);
        a.dataset.act = ch.act;
      }
      return { ch, n };
    });
    this.mapFill = el('div', 'map-fill', this.map);

    // Captions.
    this.captionBox = el('div', 'cap', root);
    this.captions = [];
    for (const ch of tl.chapters) {
      for (const c of ch.captions || []) {
        const p = el('p', 'cap-line', this.captionBox, markup(c.text));
        const b = below ? el('p', 'cap-line', below, markup(c.text)) : null;
        this.captions.push({ ch, c, p, b });
      }
    }

    // Title card.
    this.title = el('div', 'title', root);
    this.tOver = el('div', 'title-over', this.title, TITLE.over);
    this.tMain = el('div', 'title-main', this.title, TITLE.main);
    this.tZh = el('div', 'title-zh', this.title, TITLE.zh);
    this.tRule = el('div', 'title-rule', this.title);
    this.tSub = el('div', 'title-sub', this.title, TITLE.sub);
    this.tEn = el('div', 'title-en', this.title, TITLE.en);

    // End card.
    this.end = el('div', 'end', root);
    this.eMain = el('div', 'end-main', this.end, END.main);
    this.eZh = el('div', 'end-zh', this.end, END.zh);
    this.eEn = el('div', 'end-en', this.end, END.en);
    this.eRule = el('div', 'end-rule', this.end);
    this.eTag = el('div', 'end-tag', this.end, END.tagline);
    this.eNote = el('div', 'end-note', root, END.note);

    // HUD (counters, tallies) supplied by shots.
    this.hud = el('div', 'hud', root);
    this.hudKey = '';

    this.introChapter = tl.chapters.find((c) => c.id === 'intro');
    this.lastChapter = tl.chapters[tl.chapters.length - 1];
  }

  update(T, res) {
    this.updateTitle(T);
    this.updateEnd(T);
    this.updateChapters(T);
    this.updateCaptions(T);
    this.updateLabels(T, res);
    this.updateHud(res);
  }

  updateTitle(T) {
    const ic = this.introChapter;
    if (!ic) return;
    const t = T - ic.start;
    const end = ic.end - ic.start;
    const vis = t < end + 1;
    this.title.style.display = vis ? '' : 'none';
    if (!vis) return;
    const out = end - 1.3;
    const set = (e, t0, dy = 14) => {
      const o = envelope(t, t0, out + (t0 - 1.2) * 0.15, 1.1, 0.9);
      e.style.opacity = o.toFixed(3);
      e.style.transform = `translate3d(0, ${((1 - prog(t, t0, t0 + 1.6, ease.outCubic)) * dy).toFixed(2)}px, 0)`;
    };
    set(this.tOver, 1.2, 10);
    set(this.tMain, 1.5, 22);
    set(this.tZh, 2.0, 16);
    set(this.tSub, 2.9, 10);
    set(this.tEn, 3.3, 8);
    const rw = prog(t, 2.5, 3.9, ease.inOutCubic);
    this.tRule.style.opacity = envelope(t, 2.4, out + 0.2, 0.3, 0.9).toFixed(3);
    this.tRule.style.transform = `scaleX(${rw.toFixed(3)})`;
    // letter-spacing settles as the title arrives
    this.tMain.style.letterSpacing = `${(0.02 + 0.1 * (1 - prog(t, 1.5, 3.8, ease.outCubic))).toFixed(3)}em`;
  }

  updateEnd(T) {
    const lc = this.lastChapter;
    const t = T - lc.start;
    const on = t > 6;
    this.end.style.display = on ? '' : 'none';
    this.eNote.style.display = on ? '' : 'none';
    if (!on) return;
    const set = (e, t0, dy = 12) => {
      e.style.opacity = smoothstep(t0, t0 + 1.4, t).toFixed(3);
      e.style.transform = `translate3d(0, ${((1 - prog(t, t0, t0 + 1.8, ease.outCubic)) * dy).toFixed(2)}px, 0)`;
    };
    this.end.style.setProperty('--scrim', smoothstep(6.0, 7.4, t).toFixed(3));
    set(this.eMain, 6.6, 18);
    set(this.eZh, 7.1, 14);
    set(this.eEn, 7.6, 8);
    set(this.eTag, 8.6, 8);
    set(this.eNote, 9.6, 0);
    this.eRule.style.opacity = smoothstep(7.8, 8.2, t).toFixed(3);
    this.eRule.style.transform = `scaleX(${prog(t, 7.8, 9.0, ease.inOutCubic).toFixed(3)})`;
  }

  updateChapters(T) {
    let cur = null;
    for (const c of this.chapterEls) {
      const t = T - c.ch.start;
      const d = c.ch.hudEnd ?? c.ch.end - c.ch.start;
      const o = envelope(t, 0.25, d - 0.05, 0.9, 0.45);
      c.box.style.display = o > 0 ? '' : 'none';
      if (o <= 0) continue;
      c.box.style.opacity = o.toFixed(3);
      const k = 1 - prog(t, 0.25, 1.5, ease.outCubic);
      c.num.style.transform = `translate3d(0, ${(k * 18).toFixed(2)}px, 0)`;
      c.names.style.transform = `translate3d(${(k * 10).toFixed(2)}px, 0, 0)`;
      cur = c;
    }
    // Map visibility spans all numbered chapters.
    const first = this.mapNodes[0].ch;
    const last = this.mapNodes[this.mapNodes.length - 1].ch;
    const mo = envelope(T, first.start + 0.2, last.start + 6.2, 1.0, 1.0);
    this.map.style.display = mo > 0 ? '' : 'none';
    if (mo > 0) {
      this.map.style.opacity = mo.toFixed(3);
      let fill = 0;
      this.mapNodes.forEach(({ ch, n }, i) => {
        const state = T >= ch.end ? 'done' : T >= ch.start ? 'cur' : 'todo';
        if (n.dataset.state !== state) n.dataset.state = state;
        if (state === 'cur') {
          const p = clamp((T - ch.start) / (ch.end - ch.start));
          fill = (i + p) / (this.mapNodes.length - 1);
        } else if (state === 'done') fill = Math.max(fill, i / (this.mapNodes.length - 1));
      });
      this.mapFill.style.transform = `scaleX(${clamp(fill).toFixed(4)})`;
      const act = cur ? cur.ch.act : -1;
      for (const a of this.map.querySelectorAll('.map-act')) a.classList.toggle('on', Number(a.dataset.act) === act);
    }
  }

  updateCaptions(T) {
    let any = 0;
    for (const c of this.captions) {
      const t = T - c.ch.start;
      const o = envelope(t, c.c.t0, c.c.t1, 0.55, 0.45);
      const vis = o > 0.001;
      for (const p of [c.p, c.b]) {
        if (!p) continue;
        p.style.display = vis ? '' : 'none';
        if (!vis) continue;
        p.style.opacity = o.toFixed(3);
        p.style.transform = `translate3d(0, ${((1 - prog(t, c.c.t0, c.c.t0 + 0.8, ease.outCubic)) * 10).toFixed(2)}px, 0)`;
      }
      any = Math.max(any, o);
    }
    this.scrim.style.opacity = (0.35 + 0.65 * any).toFixed(3);
  }

  updateLabels(T, res) {
    const weights = new Map();
    weights.set(res.a, { w: res.b ? 1 - res.mix : 1, t: res.at });
    if (res.b) weights.set(res.b, { w: res.mix, t: res.bt });
    for (const L of this.labels) {
      const sw = weights.get(L.shot);
      let show = false;
      if (sw && sw.w > 0.01) {
        const t = sw.t;
        const d = L.def;
        if (t >= d.t0 && t <= d.t1 && d.type === 'bracket') {
          const [a, b] = d.at(t);
          _v.copy(a).project(L.shot.camera);
          const x1 = (_v.x * 0.5 + 0.5) * W;
          const y1 = (0.5 - _v.y * 0.5) * H;
          _v.copy(b).project(L.shot.camera);
          const x2 = (_v.x * 0.5 + 0.5) * W;
          const y2 = (0.5 - _v.y * 0.5) * H;
          show = true;
          this.drawBracket(L, t, sw.w, x1, y1, x2, y2);
        } else if (t >= d.t0 && t <= d.t1) {
          const wp = typeof d.at === 'function' ? d.at(t) : d.at;
          _v.copy(wp).project(L.shot.camera);
          if (_v.z < 1 && _v.z > -1) {
            show = true;
            this.drawLabel(L, t, sw.w, (_v.x * 0.5 + 0.5) * W, (0.5 - _v.y * 0.5) * H, T);
          }
        }
      }
      if (!show && L.on) {
        L.g.style.display = 'none';
        L.box.style.display = 'none';
        L.on = false;
      }
    }
  }

  drawLabel(L, t, w, ax, ay, T) {
    const d = L.def;
    if (!L.on) {
      L.g.style.display = '';
      L.box.style.display = '';
      L.on = true;
    }
    const p = (t - d.t0) / (d.dur || 1.0);
    const out = 1 - smoothstep(d.t1 - 0.5, d.t1, t);
    const o = out * w;
    const dx = d.dx ?? 110;
    const dy = d.dy ?? -90;
    const hl = d.hl ?? 150;
    const s = Math.sign(dx) || 1;
    const kx = ax + dx;
    const ky = ay + dy;
    const pd = ease.inOutCubic(clamp((p - 0.1) / 0.35));
    const ph = ease.inOutCubic(clamp((p - 0.4) / 0.3));
    const pt = ease.outCubic(clamp((p - 0.5) / 0.5));
    const pdot = ease.outBack(clamp(p / 0.3));
    // Keep the dot off the anchor by a hair so the line does not cover it.
    const len = Math.hypot(dx, dy) || 1;
    const sx = ax + (dx / len) * 7;
    const sy = ay + (dy / len) * 7;
    L.diag.setAttribute('x1', sx.toFixed(1));
    L.diag.setAttribute('y1', sy.toFixed(1));
    L.diag.setAttribute('x2', (sx + (kx - sx) * pd).toFixed(1));
    L.diag.setAttribute('y2', (sy + (ky - sy) * pd).toFixed(1));
    L.hor.setAttribute('x1', kx.toFixed(1));
    L.hor.setAttribute('y1', ky.toFixed(1));
    L.hor.setAttribute('x2', (kx + s * hl * ph).toFixed(1));
    L.hor.setAttribute('y2', ky.toFixed(1));
    L.tick.setAttribute('x1', '0');
    L.tick.setAttribute('x2', '0');
    L.tick.setAttribute('y1', '0');
    L.tick.setAttribute('y2', '0');
    L.dot.setAttribute('cx', ax.toFixed(1));
    L.dot.setAttribute('cy', ay.toFixed(1));
    L.dot.setAttribute('r', (4.2 * pdot).toFixed(2));
    const ph2 = (T * 0.7 + (d.t0 % 1)) % 1;
    L.ring.setAttribute('cx', ax.toFixed(1));
    L.ring.setAttribute('cy', ay.toFixed(1));
    L.ring.setAttribute('r', (6 + 12 * ph2).toFixed(2));
    L.ring.style.opacity = ((1 - ph2) * 0.7 * clamp(p / 0.3)).toFixed(3);
    L.g.style.opacity = o.toFixed(3);
    const bx = s > 0 ? kx + 2 : kx - 2;
    L.box.style.opacity = (o * pt).toFixed(3);
    L.box.style.transform = `translate3d(${bx.toFixed(1)}px, ${ky.toFixed(1)}px, 0) translate3d(${s > 0 ? 0 : -100}%, 0, 0) translate3d(${(
      (1 - pt) *
      -s *
      10
    ).toFixed(2)}px, 0, 0)`;
    L.box.classList.toggle('left', s < 0);
  }

  drawBracket(L, t, w, x1, y1, x2, y2) {
    const d = L.def;
    if (!L.on) {
      L.g.style.display = '';
      L.box.style.display = '';
      L.on = true;
    }
    const side = d.side ?? 1;
    const p = (t - d.t0) / (d.dur || 1.0);
    const o = (1 - smoothstep(d.t1 - 0.5, d.t1, t)) * w;
    const x = (side > 0 ? Math.max(x1, x2) : Math.min(x1, x2)) + side * (d.pad ?? 40);
    const top = Math.min(y1, y2);
    const bot = Math.max(y1, y2);
    const pv = ease.inOutCubic(clamp(p / 0.5));
    const pt = ease.outCubic(clamp((p - 0.35) / 0.5));
    const midY = (top + bot) / 2;
    const half = ((bot - top) / 2) * pv;
    const tk = 14 * pv;
    L.diag.setAttribute('x1', x.toFixed(1));
    L.diag.setAttribute('y1', (midY - half).toFixed(1));
    L.diag.setAttribute('x2', x.toFixed(1));
    L.diag.setAttribute('y2', (midY + half).toFixed(1));
    L.hor.setAttribute('x1', x.toFixed(1));
    L.hor.setAttribute('y1', (midY - half).toFixed(1));
    L.hor.setAttribute('x2', (x - side * tk).toFixed(1));
    L.hor.setAttribute('y2', (midY - half).toFixed(1));
    L.tick.setAttribute('x1', x.toFixed(1));
    L.tick.setAttribute('y1', (midY + half).toFixed(1));
    L.tick.setAttribute('x2', (x - side * tk).toFixed(1));
    L.tick.setAttribute('y2', (midY + half).toFixed(1));
    L.g.style.opacity = o.toFixed(3);
    L.box.style.opacity = (o * pt).toFixed(3);
    const bx = x + side * 18;
    L.box.style.transform = `translate3d(${bx.toFixed(1)}px, ${midY.toFixed(1)}px, 0) translate3d(${side > 0 ? 0 : -100}%, 0, 0) translate3d(${((1 - pt) * side * 8).toFixed(2)}px, 0, 0)`;
    L.box.classList.toggle('left', side < 0);
  }

  updateHud(res) {
    const shots = [res.b && res.mix > 0.5 ? [res.b, res.bt] : [res.a, res.at]];
    const [shot, t] = shots[0];
    const h = shot.hud ? shot.hud(t) : null;
    if (!h || h.opacity <= 0.001) {
      this.hud.style.display = 'none';
      return;
    }
    this.hud.style.display = '';
    this.hud.style.opacity = h.opacity.toFixed(3);
    const key = JSON.stringify(h, (k, v) => (k === 'opacity' ? undefined : v));
    if (key === this.hudKey) return;
    this.hudKey = key;
    if (h.type === 'counter') {
      this.hud.className = 'hud hud-counter';
      this.hud.innerHTML = `<div class="hud-label"><span>${h.label}</span><span class="hud-en">${h.en}</span></div><div class="hud-value">${h.value}</div>${
        h.note ? `<div class="hud-note">${h.note}</div>` : ''
      }`;
    } else if (h.type === 'tally') {
      this.hud.className = 'hud hud-tally';
      this.hud.innerHTML = h.rows
        .map(
          (r) =>
            `<div class="tally-row"><div class="hud-label"><span>${r.label}</span><span class="hud-en">${r.en}</span></div><div class="tally-dots">${Array.from(
              { length: r.total },
              (_, i) => `<i class="${i < r.n ? 'on' : ''}" style="--c:${r.color}"></i>`,
            ).join('')}</div></div>`,
        )
        .join('');
    }
  }
}

export { invLerp };
