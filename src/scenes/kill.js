import * as THREE from 'three';
import { createCell } from '../gfx/cell.js';
import { createMembrane } from '../gfx/membrane.js';
import { blob, blobGeometry, blobMaterial } from '../gfx/blob.js';
import { glowSprite, glowTexture, color } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, lerp, rng, envelope, clamp, TAU, fract } from '../engine/util.js';
import { stage, v3 } from './shared.js';

const GRANULE = { deep: '#4a1406', mid: '#ff7a40', rim: '#ffd0b0', glow: '#ff8a50' };

function sparks(n, tint, size, seed) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ color: color(tint, 2.0), size, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  const r = rng(seed);
  p.userData.seed = Array.from({ length: n }, () => [r(), r(), r(), r()]);
  return p;
}

// ---------------------------------------------------------------- immune synapse
export function synapse(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.4, 0.8, 0.6], key: '#fff0ea', keyIntensity: 1.15, fill: '#1c1428', fillIntensity: 0.8, back: '#ffc0e0', backIntensity: 0.7 },
    backdrop: { inner: '#170c22', outer: '#020104', accent: '#2a1038', accentAmt: 0.5, center: [0.45, 0.5] },
    dust: [{ count: 420, box: [18, 10, 14], tint: '#ffc8e8', tint2: '#9fe8ff', size: 0.025, focus: 6, aperture: 1.2, opacity: 0.4, seed: 211 }],
  });
  const r = rng(221);
  const RT = 1.05;
  const RB = 1.3;
  const tc = S.add(createCell({ lights: S.L, palette: 'tcell', seed: 900, detail: 52, disp: 0.06, villi: 0.012, receptors: { kind: 'car', count: 260, length: 0.14 }, haloSize: 2.8, haloOpacity: 0.16 }));
  tc.group.position.set(-1.0, 0.05, 0);
  tc.group.scale.setScalar(RT);
  tc.mat.side = THREE.DoubleSide;
  tc.mat.depthWrite = false;
  tc.b.uOpacity.value = 0.34;
  tc.b.uGlow.value = 0.1;
  tc.rec.userData.u.uGlow.value = 0.04;
  tc.rec.userData.u.uLen.value = 0.12;
  const tumor = S.add(createCell({ lights: S.L, palette: 'tumor', seed: 901, detail: 52, disp: 0.09, villi: 0.015, receptors: { kind: 'antigen', count: 300, length: 0.12 }, nucleus: { vis: 0.35, radius: 0.6 }, haloSize: 3, haloOpacity: 0.2 }));
  tumor.group.position.set(1.28, 0, 0);
  tumor.group.scale.setScalar(RB);
  const P = v3(0.06, 0.02, 0);

  // interior of the T cell
  const nucleus = blob(S.L, 930, { detail: 4, amp: 0.08, scale: [0.5, 0.46, 0.46] }, { deep: '#081838', mid: '#3050a8', rim: '#90b0ff', glow: '#6080ff', glowAmt: 0.1 });
  nucleus.position.set(-1.38, 0.08, -0.05);
  S.scene.add(nucleus);
  const NG = 18;
  const granules = Array.from({ length: NG }, (_, i) => {
    const m = blob(S.L, 940 + i, { detail: 2, amp: 0.1 }, { ...GRANULE, glowAmt: 0.35 });
    const s = r.range(0.06, 0.095);
    m.scale.setScalar(s);
    const a = r() * TAU;
    const b = Math.acos(r.range(-1, 1));
    const rr = r.range(0.35, 0.8);
    const from = v3(Math.sin(b) * Math.cos(a) * rr, Math.cos(b) * rr * 0.9, Math.sin(b) * Math.sin(a) * rr).add(v3(-1.0, 0.05, 0));
    const to = v3(-0.22 - r() * 0.2, r.range(-0.38, 0.38), r.range(-0.38, 0.38));
    S.scene.add(m);
    return { m, from, to, d: r() * 1.2 };
  });
  const mtoc = glowSprite('#ffe8b0', 0.5, 0, 2.0);
  S.scene.add(mtoc);

  // signalling: light travelling from the synapse to the nucleus
  const NS = 14;
  const sig = Array.from({ length: NS }, (_, i) => {
    const sp = glowSprite('#ffe6a0', 0.26, 0, 2.2);
    S.scene.add(sp);
    const y0 = r.range(-0.45, 0.45);
    const z0 = r.range(-0.45, 0.45);
    return { sp, a: v3(-0.02, y0, z0), c: v3(-0.7, y0 * 1.4 + r.range(-0.2, 0.2), z0 * 1.2), b: nucleus.position.clone().add(v3(0.35, y0 * 0.4, z0 * 0.4)), off: i / NS };
  });
  const bez = (a, c, b, u, out) => out.copy(a).multiplyScalar((1 - u) * (1 - u)).addScaledVector(c, 2 * u * (1 - u)).addScaledVector(b, u * u);

  // cytokines released around the synapse rim
  const cy = [sparks(110, '#ffd070', 0.11, 5), sparks(90, '#7fe6ff', 0.1, 6), sparks(70, '#ffffff', 0.085, 7)];
  cy.forEach((p) => S.scene.add(p));

  const cam = camPath(
    [
      { t: 0, p: [-0.5, 1.2, 6.4], l: [-0.1, 0.0, 0], fov: 32 },
      { t: 10.6, p: [0.7, 0.55, 5.3], l: [-0.2, 0.0, 0], fov: 31 },
    ],
    { shake: 0.012 },
  );
  const tmp = v3(0, 0, 0);
  const granCenter = v3(-0.3, 0, 0);
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 10,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.85, radius: 0.6, threshold: 0.72 },
    labels: [
      { t0: 0.8, t1: 4.6, at: () => v3(0.08, 0.72, 0.35), zh: '免疫突触', en: 'IMMUNE SYNAPSE', dx: 120, dy: -110, hl: 250, color: '#ffe6a0' },
      { t0: 4.8, t1: 8.8, at: () => granCenter.clone(), zh: '细胞毒性颗粒', en: 'CYTOTOXIC GRANULES', dx: -140, dy: -120, hl: 220, color: '#ff8a50' },
      { t0: 6.6, t1: 9.7, at: () => v3(-1.6, 1.25, 0.5), zh: '细胞因子', en: 'IFN-γ · TNF-α · IL-2', dx: -120, dy: -70, hl: 200, color: '#9fe8ff' },
    ],
    update(t) {
      cam(S.camera, t);
      tc.group.rotation.set(0, 0, 0);
      tumor.group.rotation.set(0, t * 0.03, 0);
      tc.contactToward(0, P, 0);
      tumor.contactToward(0, P, 0);
      tc.group.updateMatrixWorld(true);
      const la = tc.group.worldToLocal(P.clone()).normalize();
      tc.rec.userData.u.uBindDir.value.set(la.x, la.y, la.z, 0.5);
      tumor.group.updateMatrixWorld(true);
      const lb = tumor.group.worldToLocal(P.clone()).normalize();
      tumor.rec.userData.u.uBindDir.value.set(lb.x, lb.y, lb.z, 0.5);
      const act = smoothstep(0.8, 3.5, t);
      tc.b.uHot.value.set(la.x, la.y, la.z, 0.22 * act + 0.08 * Math.sin(t * 4) * act);
      tc.b.uGlow.value = 0.1 + 0.25 * act;
      tc.b.uOpacity.value = 0.34;
      // granules polarise toward the synapse
      granCenter.set(0, 0, 0);
      granules.forEach((g) => {
        const k = prog(t, 3.2 + g.d, 7.0 + g.d, ease.inOutSine);
        g.m.position.copy(g.from).lerp(g.to, k);
        g.m.position.x += Math.sin(t * 2 + g.d * 9) * 0.015;
        g.m.material.userData.u.uGlow.value = 0.3 + 0.5 * k;
        granCenter.add(g.m.position);
      });
      granCenter.multiplyScalar(1 / NG);
      const mk = prog(t, 2.6, 5.6, ease.inOutSine);
      mtoc.position.set(lerp(-1.0, -0.3, mk), 0.02, 0.05);
      mtoc.material.opacity = 0.7 * envelope(t, 2.4, 10.5, 0.8, 0.5);
      // signal cascade
      sig.forEach((s) => {
        const u = fract(t * 0.45 + s.off);
        bez(s.a, s.c, s.b, u, tmp);
        s.sp.position.copy(tmp);
        s.sp.material.opacity = envelope(t, 1.0, 7.4, 0.8, 1.2) * Math.sin(u * Math.PI) * 0.95;
      });
      // cytokines
      const O = tc.group.position;
      cy.forEach((p) => {
        const pos = p.geometry.attributes.position;
        p.userData.seed.forEach(([a, b, c, d], i) => {
          const u = fract(a + (t - 5.4) * 0.14 * (0.6 + b));
          const on = t > 5.4 + a * 2.0;
          // outward from the T-cell surface, biased away from the synapse
          const th = c * TAU;
          const ph = Math.acos(1 - 2 * d);
          let dx = Math.sin(ph) * Math.cos(th);
          const dy = Math.cos(ph);
          const dz = Math.sin(ph) * Math.sin(th);
          if (dx > 0.2) dx = -dx * 0.6;
          const rad = RT * 1.05 + u * 2.2;
          pos.setXYZ(i, on ? O.x + dx * rad : 99, on ? O.y + dy * rad : 99, on ? O.z + dz * rad : 99);
        });
        pos.needsUpdate = true;
        p.material.opacity = 0.85 * smoothstep(5.4, 6.4, t);
      });
      S.tick(t);
    },
  };
}

// ---------------------------------------------------------------- perforin pore
export function perforin(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.3, 0.9, 0.4], key: '#fff2ea', keyIntensity: 1.2, fill: '#20121e', fillIntensity: 0.8, back: '#ffc0d8', backIntensity: 0.6 },
    backdrop: { inner: '#1c0a1a', outer: '#020103', accent: '#34102c', accentAmt: 0.5, center: [0.5, 0.55] },
    dust: [{ count: 360, box: [16, 10, 14], tint: '#ffd0e8', tint2: '#ffe0a0', size: 0.022, focus: 5, aperture: 1.3, opacity: 0.4, seed: 231 }],
  });
  const r = rng(241);
  const mem = createMembrane(S.L, { radius: 5.2, spacing: 0.15, curv: 0.01, amp: 0.02, head: '#b05a84', innerHead: '#86405e', headRim: '#ffc8e0', tail: '#4a2036', fogNear: 3.6, fogFar: 10, fogColor: '#060208', seed: 7 });
  S.scene.add(mem);
  const tmem = createMembrane(S.L, { radius: 5.2, spacing: 0.15, curv: 0.01, amp: 0.02, head: '#4f8aa2', innerHead: '#3f6f86', headRim: '#b8ecff', tail: '#28495a', fogNear: 3.6, fogFar: 9, fogColor: '#060208', seed: 8 });
  tmem.rotation.x = Math.PI;
  tmem.position.y = 2.9;
  S.scene.add(tmem);

  // granule docked under the T-cell membrane, fusing to release its cargo
  const gran = blob(S.L, 250, { detail: 4, amp: 0.05 }, { ...GRANULE, transparent: true, opacity: 0.85, glowAmt: 0.35 });
  gran.scale.setScalar(0.42);
  S.scene.add(gran);
  const REL = v3(0.15, 2.45, 0.1);
  const fuse = glowSprite('#ffe6b0', 2.0, 0, 1.6);
  fuse.position.copy(REL);
  S.scene.add(fuse);

  // perforin monomers → ring
  const NP = 16;
  const RING = 0.52;
  const pGeo = blobGeometry(260, { detail: 2, amp: 0.08, scale: [0.075, 0.26, 0.09] });
  const pMat = blobMaterial(S.L, { deep: '#3a2c18', mid: '#d8c49a', rim: '#fff0d0', glow: '#ffe6b0', glowAmt: 0.04, spec: 0.45 });
  const perf = Array.from({ length: NP }, (_, i) => {
    const m = new THREE.Mesh(pGeo, pMat);
    S.scene.add(m);
    const a = (i / NP) * TAU;
    return { m, a, from: REL.clone().add(v3(r.range(-0.3, 0.3), r.range(-0.2, 0.1), r.range(-0.3, 0.3))), mid: v3(Math.cos(a) * 1.3 + r.range(-0.3, 0.3), 1.0 + r.range(-0.2, 0.3), Math.sin(a) * 1.3 + r.range(-0.3, 0.3)), d: i * 0.07 + r() * 0.1, spin: r.range(-2, 2) };
  });
  const pore = glowSprite('#ffb070', 1.4, 0, 1.4);
  S.scene.add(pore);
  // granzymes
  const NZ = 12;
  const gzGeo = blobGeometry(270, { detail: 2, amp: 0.1 });
  const gzMat = blobMaterial(S.L, { deep: '#4a1a04', mid: '#ff9a3a', rim: '#ffe0b0', glow: '#ffa040', glowAmt: 0.6 });
  const gz = Array.from({ length: NZ }, (_, i) => {
    const m = new THREE.Mesh(gzGeo, gzMat);
    m.scale.setScalar(0.075);
    S.scene.add(m);
    return { m, from: REL.clone().add(v3(r.range(-0.35, 0.35), r.range(-0.25, 0.05), r.range(-0.35, 0.35))), hover: v3(r.range(-0.3, 0.3), r.range(0.45, 1.1), r.range(-0.3, 0.3)), d: i * 0.18 + r() * 0.1, ph: r() * TAU };
  });

  const cam = camPath(
    [
      { t: 0, p: [2.1, 1.55, 4.4], l: [0.1, 1.75, 0], fov: 34 },
      { t: 3.2, p: [2.2, 2.1, 4.6], l: [0.05, 0.8, 0], fov: 34 },
      { t: 8.6, p: [0.95, 2.25, 2.3], l: [0, 0.12, 0], fov: 34 },
    ],
    { shake: 0.012 },
  );
  const tmp = v3(0, 0, 0);
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 8,
    transition: { type: 'cross', dur: 1.0 },
    bloom: { strength: 0.85, radius: 0.6, threshold: 0.72 },
    labels: [
      { t0: 2.2, t1: 5.8, at: () => perf[3].m.position.clone().add(v3(0, 0.15, 0)), zh: '穿孔素', en: 'PERFORIN', dx: 140, dy: -80, hl: 150, color: '#fff0d0' },
      { t0: 5.0, t1: 7.8, at: () => gz[1].m.position.clone(), zh: '颗粒酶', en: 'GRANZYMES', dx: -150, dy: -90, hl: 170, color: '#ffa040' },
    ],
    update(t) {
      cam(S.camera, t);
      mem.userData.u.uTime.value = t;
      tmem.userData.u.uTime.value = t;
      tmem.position.y = 2.9 + 2.0 * smoothstep(3.0, 6.0, t);
      // fusion
      const f = prog(t, 0.4, 1.6, ease.inOutSine);
      gran.position.copy(REL).add(v3(0, -0.35 + 0.5 * f, 0));
      gran.scale.setScalar(0.42 * (1 - 0.8 * f));
      gran.visible = f < 0.98;
      gran.material.userData.u.uOpacity.value = 0.85 * (1 - f);
      fuse.material.opacity = 0.6 * envelope(t, 1.0, 2.6, 0.3, 1.0);
      // perforin: scatter, settle, oligomerise into a ring that punches through
      const surf = mem.userData.surfY(0, 0, t) + 0.27;
      perf.forEach((p, i) => {
        const k1 = prog(t, 1.4 + p.d * 0.4, 3.0 + p.d * 0.4, ease.inOutSine);
        const k2 = prog(t, 3.0 + p.d, 4.2 + p.d, ease.inOutCubic);
        const ringPos = v3(Math.cos(p.a) * RING, surf - 0.12 * smoothstep(4.6, 5.4, t), Math.sin(p.a) * RING);
        if (k2 <= 0) {
          p.m.position.copy(p.from).lerp(p.mid, k1);
          p.m.rotation.set(t * p.spin, t * p.spin * 0.7, 0.4);
        } else {
          p.m.position.copy(p.mid).lerp(ringPos, k2);
          const tilt = lerp(0.9, 0, k2);
          p.m.rotation.set(0, -p.a, tilt);
        }
        p.m.visible = t > 1.3;
      });
      const open = prog(t, 4.4, 5.6, ease.inOutSine);
      mem.userData.u.uClear0.value.set(0, 0, 0.62 * open, open > 0 ? 1.4 : 0);
      pore.position.set(0, surf - 0.2, 0);
      pore.material.opacity = 0.45 * open * (0.8 + 0.2 * Math.sin(t * 5));
      // granzymes: hover, then slip through the pore
      gz.forEach((g, i) => {
        const k1 = prog(t, 1.5, 3.2, ease.outCubic);
        const k2 = prog(t, 5.2 + g.d, 6.8 + g.d, ease.inOutSine);
        tmp.copy(g.from).lerp(g.hover, k1);
        tmp.x += Math.sin(t * 1.4 + g.ph) * 0.06 * (1 - k2);
        tmp.z += Math.cos(t * 1.2 + g.ph) * 0.06 * (1 - k2);
        if (k2 > 0) {
          const down = v3(Math.cos(g.ph) * 0.18, surf - 1.6, Math.sin(g.ph) * 0.18);
          const mid = v3(Math.cos(g.ph) * 0.15, surf + 0.1, Math.sin(g.ph) * 0.15);
          if (k2 < 0.5) tmp.lerp(mid, k2 * 2);
          else tmp.copy(mid).lerp(down, (k2 - 0.5) * 2);
        }
        g.m.position.copy(tmp);
        g.m.visible = t > 1.4;
      });
      S.tick(t);
    },
  };
}

// ---------------------------------------------------------------- apoptosis
export function apoptosis(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.45, 0.75, 0.6], key: '#fff0ea', keyIntensity: 1.2, fill: '#221428', fillIntensity: 0.75, back: '#ffb0d0', backIntensity: 0.7 },
    backdrop: { inner: '#1c0c24', outer: '#030106', accent: '#3a1038', accentAmt: 0.45, center: [0.55, 0.5] },
    dust: [{ count: 460, box: [20, 12, 16], tint: '#ffb8e0', tint2: '#9fe8ff', size: 0.03, focus: 6, aperture: 1.3, opacity: 0.4, seed: 251 }],
  });
  const r = rng(261);
  const RB = 1.3;
  const RA = 0.88;
  const tumor = S.add(createCell({ lights: S.L, palette: 'tumor', seed: 950, detail: 52, disp: 0.09, villi: 0.015, receptors: { kind: 'antigen', count: 300, length: 0.12 }, nucleus: { vis: 0.4, radius: 0.6 }, haloSize: 3, haloOpacity: 0.22 }));
  tumor.group.position.set(0.9, 0, 0);
  tumor.group.scale.setScalar(RB);
  tumor.b.uHotColor.value = color('#ff8a3a');
  const B = tumor.group.position.clone();
  const tc = S.add(createCell({ lights: S.L, palette: 'tcell', seed: 951, detail: 48, disp: 0.07, villi: 0.018, receptors: { kind: 'car', count: 230, length: 0.15 }, haloSize: 3, haloOpacity: 0.2 }));
  tc.group.scale.setScalar(RA);
  tc.b.uGlow.value = 0.2;
  tc.rec.userData.u.uGlow.value = 0.18;
  const dir = v3(1, -0.05, -0.1).normalize();
  const A0 = B.clone().addScaledVector(dir, -(RA + RB) * 0.9);
  const A1 = v3(-3.3, 1.2, 0.6);

  // apoptotic bodies
  const NF = 14;
  const fdirs = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NF; i++) {
    const y = 1 - ((i + 0.5) / NF) * 2;
    const rr = Math.sqrt(1 - y * y);
    fdirs.push(v3(Math.cos(golden * i) * rr, y, Math.sin(golden * i) * rr));
  }
  const frags = Array.from({ length: NF }, (_, i) => {
    const c = S.add(createCell({ lights: S.L, palette: 'tumor', seed: 960 + i, detail: 24, disp: 0.14, villi: 0, haloOpacity: 0.12, haloSize: 2.4 }));
    const d = fdirs[i].clone();
    if (d.x < -0.3) d.x = -d.x * 0.5;
    d.normalize();
    const s = r.range(0.2, 0.42);
    c.group.scale.setScalar(s);
    c.u.uBleb.value = 0.3;
    c.b.uDark.value = 0.5;
    c.opacity = 0;
    return { c, d, s, sp: r.range(0.25, 0.6), spin: v3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)) };
  });
  const burst = glowSprite('#ffb07a', 5, 0, 1.4);
  burst.position.copy(B);
  S.scene.add(burst);
  const debris = sparks(160, '#ffb0c8', 0.06, 9);
  S.scene.add(debris);

  const cam = camPath(
    [
      { t: 0, p: [0.0, 0.7, 6.6], l: [0.3, 0.0, 0], fov: 32 },
      { t: 10.6, p: [0.9, 0.9, 6.0], l: [0.5, 0.05, 0], fov: 33 },
    ],
    { shake: 0.012 },
  );
  const P = v3(0, 0, 0);
  const T_BREAK = 5.8;
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 10,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.85, radius: 0.6, threshold: 0.72 },
    labels: [
      { t0: 2.3, t1: 5.6, at: () => B.clone().add(v3(0.5, 1.1, 0.4)), zh: '细胞凋亡', en: 'APOPTOSIS', dx: 120, dy: -90, hl: 150, color: '#ff9a6a' },
      { t0: 6.6, t1: 9.6, at: () => frags[2].c.group.position.clone(), zh: '凋亡小体', en: 'APOPTOTIC BODIES', dx: 130, dy: 80, hl: 190, color: '#ff9ccb' },
    ],
    update(t) {
      cam(S.camera, t);
      // T cell holds on, then lets go and leaves
      const leave = prog(t, 4.6, 8.8, ease.inOutSine);
      const A = A0.clone().lerp(A1, leave);
      tc.group.position.copy(A);
      tc.group.rotation.set(0.1, t * 0.2, 0);
      // tumour dies: caspase glow → blebs → shrink → break apart
      const glow = smoothstep(0.2, 2.6, t);
      const bleb = smoothstep(1.8, 5.2, t);
      const k = smoothstep(T_BREAK - 0.5, T_BREAK + 0.3, t);
      tumor.group.scale.setScalar(RB * (1 - 0.18 * bleb) * (1 - 0.9 * k));
      tumor.u.uBleb.value = 0.55 * bleb;
      tumor.u.uDispSpeed.value = 0.1 + 0.4 * bleb;
      tumor.b.uDark.value = 0.55 * bleb;
      tumor.b.uGlowColor.value.set(1.0, 0.45, 0.2);
      tumor.b.uGlow.value = 0.35 * glow * (1 - k);
      tumor.rec.userData.u.uAppear.value = 1 - 0.7 * bleb;
      tumor.opacity = 1 - smoothstep(T_BREAK, T_BREAK + 0.35, t);
      tumor.group.rotation.set(0, t * 0.06, 0);
      // contact while attached
      const D = A.distanceTo(B);
      P.copy(A).lerp(B, RA / (RA + RB));
      if (D < RA + RB * (1 - 0.18 * bleb) && leave < 0.15) {
        tc.contactToward(0, P, 0);
        tumor.contactToward(0, P, 0);
      } else {
        tc.contact(0, [0, 1, 0], 9);
        tumor.contact(0, [0, 1, 0], 9);
      }
      tumor.group.updateMatrixWorld(true);
      const lb = tumor.group.worldToLocal(P.clone()).normalize();
      tumor.b.uHot.value.set(lb.x, lb.y, lb.z, 0.6 * envelope(t, 0, 5.2, 0.6, 1.5));
      // fragments
      const fk = t - T_BREAK;
      frags.forEach((f) => {
        const a = smoothstep(0, 0.4, fk) * (1 - smoothstep(3.0, 4.2, fk));
        f.c.opacity = a;
        f.c.group.position.copy(B).addScaledVector(f.d, RB * 0.55 + Math.max(0, fk) * f.sp * 0.6);
        f.c.group.rotation.set(t * f.spin.x, t * f.spin.y, t * f.spin.z);
        f.c.group.scale.setScalar(f.s * (0.6 + 0.4 * smoothstep(0, 0.5, fk)) * (1 - 0.4 * smoothstep(2.5, 4.2, fk)));
      });
      burst.material.opacity = 0.3 * envelope(t, T_BREAK - 0.2, T_BREAK + 1.4, 0.15, 1.1);
      const dp = debris.geometry.attributes.position;
      debris.userData.seed.forEach(([a, b, c, d], i) => {
        const dirv = v3(Math.sin(b * Math.PI) * Math.cos(a * TAU), Math.cos(b * Math.PI), Math.sin(b * Math.PI) * Math.sin(a * TAU));
        const dist = fk > 0 ? RB * 0.5 + fk * (0.4 + c * 1.2) : 0;
        dp.setXYZ(i, B.x + dirv.x * dist, B.y + dirv.y * dist, B.z + dirv.z * dist);
      });
      dp.needsUpdate = true;
      debris.material.opacity = fk > 0 ? 0.9 * (1 - smoothstep(0.5, 3.5, fk)) : 0;
      S.tick(t);
    },
  };
}
