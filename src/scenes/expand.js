import * as THREE from 'three';
import { createCell } from '../gfx/cell.js';
import { createCrowd } from '../gfx/crowd.js';
import { glowSprite, color } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, lerp, rng, envelope, clamp } from '../engine/util.js';
import { stage, v3 } from './shared.js';

const GENS = 4; // 16 detailed cells
const T_DIV = [1.1, 2.9, 4.4, 5.6];
const MITOSIS = 1.1;

// One CAR-T cell becomes two, four, eight... then the camera pulls back on a
// culture of hundreds of millions.
export function expand(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.5, 0.75, 0.55], key: '#fff3e6', keyIntensity: 1.15, fill: '#15283e', fillIntensity: 0.7, back: '#8fe6ff' },
    backdrop: { inner: '#0b2034', outer: '#010207', accent: '#0f3a52', accentAmt: 0.5, center: [0.5, 0.5] },
    dust: [{ count: 500, box: [40, 26, 40], tint: '#9fdcff', tint2: '#ffdca0', size: 0.05, focus: 10, aperture: 1.0, opacity: 0.5, seed: 81 }],
  });
  const r = rng(91);
  const N = 1 << GENS;
  const heroes = Array.from({ length: N }, (_, i) => {
    const c = S.add(
      createCell({ lights: S.L, palette: 'tcell', seed: 300 + i, detail: 32, disp: 0.06, villi: 0.018, receptors: { kind: 'car', count: 170, length: 0.15 }, nucleus: { vis: 0.4, radius: 0.55 }, haloSize: 3, haloOpacity: 0.16 }),
    );
    c.b.uGlow.value = 0.1;
    c.rec.userData.u.uGlow.value = 0.18;
    c.u.uPinch.value.set(0, 0.34, 0.04);
    return c;
  });
  const axes = [v3(1, 0.12, 0.05).normalize(), v3(0.1, 1, -0.15).normalize(), v3(-0.05, 0.1, 1).normalize(), v3(1, -0.1, 0.2).normalize()];
  const sep = [1.02, 1.02, 1.02, 2.04];
  // per-node jitter so divisions are not in lock-step
  const jit = new Map();
  const nodeJit = (k, id) => {
    const key = k * 100 + id;
    if (!jit.has(key)) jit.set(key, r.range(-0.22, 0.22));
    return jit.get(key);
  };
  const start = (k, i) => T_DIV[k] + (k === 0 ? 0 : nodeJit(k, i & ((1 << k) - 1)));

  // The wider culture: nearby cells as meshes, the far field as glowing points.
  const SW = 1500;
  const swarm = createCrowd(S.L, SW, { palette: 'tcell', detail: 6, disp: 0.07, villi: 0.0, speck: 1.6, fog: 1, fogColor: '#04101c', fogNear: 30, fogFar: 120, seed: 13 });
  S.scene.add(swarm);
  const sw = [];
  for (let i = 0; i < SW; i++) {
    let p;
    do {
      p = v3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1));
    } while (p.lengthSq() > 1);
    const d = p.length();
    p.multiply(v3(24, 15, 24));
    if (p.length() < 5.2) p.setLength(5.2 + r() * 2);
    sw.push({ p, at: 6.0 + 3.6 * Math.pow(d, 0.8) + r() * 0.5, s: r.range(0.8, 1.05), rot: new THREE.Euler(r() * 6, r() * 6, r() * 6) });
  }
  const FAR = 18000;
  const fpos = new Float32Array(FAR * 3);
  const fat = new Float32Array(FAR * 2);
  for (let i = 0; i < FAR; i++) {
    let p;
    do {
      p = v3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1));
    } while (p.lengthSq() > 1);
    const d = p.length();
    p.multiply(v3(50, 26, 50));
    if (p.length() < 4) p.setLength(4 + r() * 3);
    fpos.set([p.x, p.y, p.z], i * 3);
    fat[i * 2] = d < 0.45 ? 9.3 + r() * 0.9 : 7.4 + 3.2 * Math.pow(d, 0.7) + r() * 0.4;
    fat[i * 2 + 1] = r();
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fg.setAttribute('aT', new THREE.BufferAttribute(fat, 2));
  const fu = { uTime: { value: 0 }, uScale: { value: 800 }, uCyan: { value: color('#5fd8ff', 1.4) }, uGold: { value: color('#ffc860', 1.8) }, uFrost: { value: 0 } };
  const farPts = new THREE.Points(
    fg,
    new THREE.ShaderMaterial({
      uniforms: fu,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec2 aT; uniform float uTime; uniform float uScale;
        varying float vA; varying float vK;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float a = smoothstep(aT.x, aT.x + 0.6, uTime);
          float d = max(1.0, -mv.z);
          gl_PointSize = clamp(0.95 * uScale / d, 1.5, 14.0) * a;
          vA = a * clamp(40.0 / d, 0.25, 1.0);
          vK = aT.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uCyan; uniform vec3 uGold; uniform float uFrost; varying float vA; varying float vK;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
          float core = smoothstep(1.0, 0.0, r);
          vec3 col = mix(uCyan, uGold, step(0.82, vK));
          col = mix(col, vec3(0.8, 0.92, 1.0), uFrost * 0.6);
          gl_FragColor = vec4(col * core * core * vA * 0.55, 1.0);
        }`,
    }),
  );
  farPts.frustumCulled = false;
  S.scene.add(farPts);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = v3(1, 1, 1);
  const frost = glowSprite('#cfeaff', 60, 0, 1);
  frost.position.set(0, 0, 0);
  S.scene.add(frost);

  const cam = camPath(
    [
      { t: 0, p: [0.9, 0.5, 5.2], l: [0.2, 0, 0], fov: 32 },
      { t: 3.2, p: [1.8, 1.2, 7.8], l: [0.6, 0.3, 0.2], fov: 32 },
      { t: 6.4, p: [5.5, 3.6, 15], l: [1.2, 0.8, 0.8], fov: 33 },
      { t: 9.2, p: [16, 9, 42], l: [0.8, 0.5, 0.5], fov: 35 },
      { t: 12.6, p: [36, 22, 112], l: [0, -2, 0], fov: 38 },
    ],
    { mode: 'global', ease: ease.inOutSine, shake: 0.02 },
  );

  let visibleCount = 1;
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 12,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.85, radius: 0.6, threshold: 0.72 },
    labels: [{ t0: 1.3, t1: 3.2, at: () => heroes[0].group.position.clone().add(v3(0.1, 1.05, 0.2)), zh: '细胞分裂', en: 'CELL DIVISION', dx: 110, dy: -80, hl: 140, color: '#7fe6ff' }],
    hud(t) {
      let value;
      if (t < 6.9) value = String(visibleCount);
      else {
        const e = lerp(Math.log10(16), Math.log10(5e8), prog(t, 6.9, 11.2, ease.inOutSine));
        const n = Math.pow(10, e);
        if (n < 1000) value = String(Math.round(n));
        else {
          const ex = Math.floor(e);
          value = `${(n / Math.pow(10, ex)).toFixed(1)} × 10<sup>${ex}</sup>`;
        }
      }
      return { type: 'counter', label: '细胞数量', en: 'CELL COUNT', value, note: '体外培养约 1–2 周', opacity: envelope(t, 0.8, 11.7, 0.6, 0.5) };
    },
    update(t) {
      cam(S.camera, t);
      // detailed cells: walk the division tree
      let count = 0;
      for (let i = 0; i < N; i++) {
        const c = heroes[i];
        let L = 0;
        while (L < GENS && t >= start(L, i) + MITOSIS) L++;
        const rep = (i >> L) === 0;
        if (!rep) {
          c.opacity = 0;
          continue;
        }
        count++;
        const pos = v3(0, 0, 0);
        let s = 1;
        for (let k = 0; k < L; k++) {
          const split = start(k, i) + MITOSIS;
          const a = smoothstep(split, split + 0.9, t);
          const d = lerp(0.9, sep[k], a);
          const sign = (i >> k) & 1 ? 1 : -1;
          pos.addScaledVector(axes[k], sign * d);
          if (k === L - 1) s = lerp(0.9, 1, a);
        }
        // slow outward drift keeps the cluster breathing
        pos.multiplyScalar(1 + 0.05 * smoothstep(3, 9, t));
        c.group.position.copy(pos);
        c.group.scale.setScalar(s);
        c.opacity = 1;
        // mitosis in progress?
        if (L < GENS && t >= start(L, i)) {
          const p = clamp((t - start(L, i)) / MITOSIS);
          const ax = axes[L];
          c.u.uStretch.value.set(ax.x, ax.y, ax.z, 0.8 * smoothstep(0, 0.75, p));
          c.u.uPinchAxis.value.set(ax.x, ax.y, ax.z, 0);
          c.u.uPinch.value.x = smoothstep(0.2, 1.0, p);
          c.b.uGlow.value = 0.1 + 0.25 * Math.sin(p * Math.PI);
        } else {
          c.u.uStretch.value.w = 0;
          c.u.uPinch.value.x = 0;
          c.b.uGlow.value = 0.1;
        }
      }
      visibleCount = count;
      // culture fades in around them
      for (let i = 0; i < SW; i++) {
        const o = sw[i];
        const a = smoothstep(o.at, o.at + 0.5, t) * (1 - smoothstep(9.8, 11.0, t));
        q.setFromEuler(o.rot);
        scl.setScalar(o.s * a + 1e-4);
        m4.compose(o.p, q, scl);
        swarm.setMatrixAt(i, m4);
      }
      swarm.instanceMatrix.needsUpdate = true;
      swarm.userData.u.uTime.value = t;
      // cool frost as the batch is frozen for shipping
      const fz = smoothstep(10.2, 12.2, t);
      frost.material.opacity = 0.06 * fz;
      swarm.userData.u.uGlowAll.value = 0.1 - 0.08 * fz;
      fu.uTime.value = t;
      fu.uFrost.value = fz;
      fu.uScale.value = (ctx.renderer.size.y * ctx.renderer.dpr) / (2 * Math.tan((S.camera.fov * Math.PI) / 360));
      S.bg.userData.uniforms.uAccent.value.copy(color('#0f3a52')).lerp(color('#5a86a8'), fz * 0.6);
      S.tick(t);
    },
  };
}
