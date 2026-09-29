import * as THREE from 'three';
import { createCell } from '../gfx/cell.js';
import { createRBCs } from '../gfx/rbc.js';
import { createVessel } from '../gfx/vessel.js';
import { blob, tube } from '../gfx/blob.js';
import { glowSprite, glowTexture, color } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, lerp, rng, envelope, clamp, TAU, fract } from '../engine/util.js';
import { stage, v3 } from './shared.js';

// ---------------------------------------------------------------- in the bloodstream
export function vessel(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [0.1, 0.35, 1.0], key: '#fff0ea', keyIntensity: 1.25, fill: '#3a1016', fillIntensity: 0.7, back: '#ff9a9a', backIntensity: 0.7 },
    backdrop: { inner: '#1a0306', outer: '#050102', accent: '#2a0810', accentAmt: 0.3, center: [0.5, 0.5] },
    dust: [{ count: 700, box: [5, 5, 40], center: [0, 0, 14], tint: '#ffc0c0', size: 0.02, focus: 3, aperture: 1.6, opacity: 0.4, seed: 131, speed: 0.0 }],
  });
  const R = 2.3;
  const vw = createVessel(S.L, { radius: R, length: 90, fogNear: 2, fogFar: 22 });
  vw.position.z = 30;
  S.scene.add(vw);

  const r = rng(141);
  const NR = 900;
  const rbcs = createRBCs(S.L, NR, { deep: '#3a0309', mid: '#b3162c', rim: '#ff6a74', fog: 1, fogColor: '#1a0306', fogNear: 2, fogFar: 22, seed: 4 });
  S.scene.add(rbcs);
  const LEN = 44;
  const rb = Array.from({ length: NR }, () => {
    let x;
    let y;
    let rr;
    do {
      const a = r() * TAU;
      rr = Math.sqrt(r()) * (R - 0.3);
      x = Math.cos(a) * rr;
      y = Math.sin(a) * rr;
    } while (Math.hypot(x - 0.1, y - 0.15) < 0.75);
    return { z0: r() * LEN, x, y, sp: 2.4 * (1 - (rr / R) ** 2) + 0.5, axis: new THREE.Vector3(...r.dir()), spin: r.range(0.3, 1.2), ph: r() * TAU, s: r.range(0.2, 0.24) };
  });

  // CAR-T cells riding the flow; the first one is our hero.
  const cars = [
    { x: 0.55, y: -0.25, z0: 3.2, sp: 1.52, s: 0.34 },
    { x: -1.1, y: 0.7, z0: 9.5, sp: 1.3, s: 0.32 },
    { x: 1.2, y: 0.9, z0: 14, sp: 1.25, s: 0.32 },
    { x: -0.4, y: -1.2, z0: 18, sp: 1.35, s: 0.32 },
    { x: 0.2, y: 1.3, z0: 24, sp: 1.2, s: 0.32 },
  ].map((o, i) => {
    const c = S.add(createCell({ lights: S.L, palette: 'tcell', seed: 400 + i, detail: i === 0 ? 44 : 24, disp: 0.07, villi: 0.018, receptors: { kind: 'car', count: i === 0 ? 200 : 120, length: 0.15 }, haloSize: 3, haloOpacity: 0.2 }));
    c.group.scale.setScalar(o.s);
    c.b.uGlow.value = 0.18;
    c.rec.userData.u.uGlow.value = 0.2;
    return { c, ...o };
  });
  const hero = cars[0];

  const cz = (t) => t * 1.45;
  const cam = (t) => {
    const z = cz(t);
    S.camera.position.set(0.1 + 0.25 * Math.sin(t * 0.4), 0.15 + 0.12 * Math.sin(t * 0.33), z);
    S.camera.up.set(Math.sin(t * 0.12) * 0.1, 1, 0);
    S.camera.lookAt(0.25 + 0.2 * Math.sin(t * 0.3), -0.05, z + 6);
    if (S.camera.fov !== 50) {
      S.camera.fov = 50;
      S.camera.updateProjectionMatrix();
    }
    S.camera.updateMatrixWorld(true);
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = v3(0, 0, 0);
  const scl = v3(1, 1, 1);
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 7,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.8, radius: 0.6, threshold: 0.74 },
    labels: [
      { t0: 0.8, t1: 4.8, at: () => hero.c.group.position.clone().add(v3(0.12, 0.3, 0)), zh: 'CAR-T 细胞', en: 'CAR-T CELL', dx: 130, dy: -110, hl: 170, color: '#7fe6ff' },
      { t0: 2.2, t1: 5.8, at: (t) => v3(-1.35, -0.9, cz(t) + 4.2), zh: '红细胞', en: 'RED BLOOD CELLS', dx: -120, dy: 90, hl: 170, color: '#ff6a74' },
    ],
    update(t) {
      cam(t);
      const camZ = cz(t);
      for (let i = 0; i < NR; i++) {
        const c = rb[i];
        const z = camZ - 3 + fract((c.z0 + t * c.sp - camZ) / LEN) * LEN;
        pos.set(c.x + 0.04 * Math.sin(t * 0.7 + c.ph), c.y + 0.04 * Math.cos(t * 0.6 + c.ph), z);
        q.setFromAxisAngle(c.axis, c.ph + t * c.spin);
        scl.setScalar(c.s);
        m4.compose(pos, q, scl);
        rbcs.setMatrixAt(i, m4);
      }
      rbcs.instanceMatrix.needsUpdate = true;
      for (const o of cars) {
        o.c.group.position.set(o.x + 0.06 * Math.sin(t * 0.8 + o.z0), o.y + 0.05 * Math.cos(t * 0.7 + o.z0), o.z0 + t * o.sp);
        o.c.group.rotation.set(t * 0.3 + o.z0, t * 0.4, 0);
      }
      vw.userData.u.uTime.value = t;
      S.dusts[0].userData.u.uCenter.value.set(0, 0, camZ + 12);
      S.tick(t);
    },
  };
}

// ---------------------------------------------------------------- through the wall
export function extravasate(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.35, 0.8, 0.6], key: '#fff2ea', keyIntensity: 1.2, fill: '#241420', fillIntensity: 0.75, back: '#ffb0c8', backIntensity: 0.7 },
    backdrop: { inner: '#1e0c1c', outer: '#030104', accent: '#3a1030', accentAmt: 0.5, center: [0.62, 0.35] },
    dust: [{ count: 420, box: [22, 12, 12], tint: '#ffc0d8', size: 0.025, focus: 8, aperture: 1.2, opacity: 0.35, seed: 151 }],
  });
  const r = rng(161);
  const WALL_Y = 0.15;
  // endothelial layer: a row of flattened cells, the gap at x = 0
  const endo = [];
  const ENDO = { deep: '#4a1018', mid: '#b04a58', rim: '#ffaab0' };
  for (let row = 0; row < 3; row++) {
    for (let i = -6; i <= 6; i++) {
      const m = blob(S.L, 500 + row * 20 + i, { detail: 4, amp: 0.07, freq: [1.2, 3], scale: [1.0, 0.24, 0.7] }, { ...ENDO, spec: 0.5, rimAmt: 0.6 });
      const x = i * 1.55 + (i >= 0 ? 0.78 : -0.78) + (row % 2) * 0.3;
      m.position.set(x, WALL_Y + (r() - 0.5) * 0.04, -row * 1.35);
      m.scale.set(r.range(0.92, 1.05), 1, r.range(0.95, 1.05));
      S.scene.add(m);
      endo.push({ m, x, row, i });
    }
  }
  // extracellular matrix fibres beneath
  for (let i = 0; i < 9; i++) {
    const y = r.range(-4.8, -1.2);
    const z = r.range(-6, -1.5);
    const x0 = r.range(-12, -4);
    const pts = [];
    for (let k = 0; k < 6; k++) pts.push(v3(x0 + k * r.range(2.6, 4), y + r.range(-0.9, 0.9), z + r.range(-0.8, 0.8)));
    S.scene.add(tube(S.L, pts, { radius: 0.03, segments: 90, radial: 6, deep: '#1a1016', mid: '#4a3642', rim: '#a88898', transparent: true, opacity: 0.4, soft: 0.6 }));
  }
  // tumour cells glowing below right
  const tumors = [v3(5.2, -3.6, -2.2), v3(7.2, -2.4, -4.2), v3(3.4, -4.8, -3.6)].map((p, i) => {
    const c = S.add(createCell({ lights: S.L, palette: 'tumor', seed: 600 + i, detail: 40, disp: 0.09, villi: 0.015, receptors: { kind: 'antigen', count: 140, length: 0.13 }, haloSize: 3.2, haloOpacity: 0.3 }));
    c.group.position.copy(p);
    c.group.scale.setScalar(1.1);
    c.b.uGlow.value = 0.2;
    return c;
  });
  // lumen: red cells streaming above
  const NR = 160;
  const rbcs = createRBCs(S.L, NR, { deep: '#3a0309', mid: '#a8142a', rim: '#ff6a74', fog: 0.6, fogColor: '#1e0c1c', fogNear: 6, fogFar: 16, seed: 21 });
  S.scene.add(rbcs);
  const rb = Array.from({ length: NR }, () => ({ x0: r() * 30, y: r.range(0.9, 4.2), z: r.range(-5, 1.5), sp: r.range(1.6, 2.6), axis: new THREE.Vector3(...r.dir()), ph: r() * TAU, s: r.range(0.26, 0.3) }));

  // chemokine gradient: particles drifting from the tumour toward the gap
  const NCK = 260;
  const ckGeo = new THREE.BufferGeometry();
  ckGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NCK * 3), 3));
  const ckMat = new THREE.PointsMaterial({ color: color('#ff8ccc', 2.2), size: 0.11, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const ck = new THREE.Points(ckGeo, ckMat);
  ck.frustumCulled = false;
  S.scene.add(ck);
  const ckSeed = Array.from({ length: NCK }, () => [r(), r(), r(), r() * 2 - 1]);
  const src = v3(5.0, -3.4, -2.2);
  const dst = v3(0.2, -0.3, 0);

  const hero = S.add(createCell({ lights: S.L, palette: 'tcell', seed: 700, detail: 48, disp: 0.07, villi: 0.018, receptors: { kind: 'car', count: 220, length: 0.15 }, haloSize: 3, haloOpacity: 0.22 }));
  const HS = 0.62;
  hero.group.scale.setScalar(HS);
  hero.b.uGlow.value = 0.15;
  hero.rec.userData.u.uGlow.value = 0.2;

  // hero path: roll along the wall, stop over the gap, squeeze through, crawl to the tumour
  const path = (t) => {
    const p = v3(0, 0, 0.25);
    if (t < 3.4) {
      const k = prog(t, 0, 3.4, ease.outCubic);
      p.x = lerp(-6.5, 0.0, k);
      p.y = lerp(1.6, WALL_Y + 0.2 + HS * 0.92, smoothstep(0, 2.2, t));
    } else if (t < 6.6) {
      const k = prog(t, 3.6, 6.4, ease.inOutSine);
      p.x = 0;
      p.y = lerp(WALL_Y + 0.2 + HS * 0.92, WALL_Y - 0.1 - HS * 0.95, k);
    } else {
      const k = prog(t, 6.6, 9.6, ease.inOutSine);
      p.copy(v3(0, WALL_Y - 0.1 - HS * 0.95, 0.25).lerp(v3(2.6, -2.1, -0.8), k));
    }
    return p;
  };

  const cam = camPath(
    [
      { t: 0, p: [-0.6, 0.6, 8.6], l: [-0.6, 0.2, 0], fov: 34 },
      { t: 4.8, p: [0.2, 0.2, 7.2], l: [0.1, -0.1, 0], fov: 32 },
      { t: 9.6, p: [1.9, -1.0, 7.8], l: [2.0, -1.4, -0.6], fov: 34 },
    ],
    { shake: 0.012 },
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = v3(0, 0, 0);
  const scl = v3(1, 1, 1);
  const tmp = v3(0, 0, 0);
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 9,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.8, radius: 0.6, threshold: 0.74 },
    labels: [
      { t0: 0.9, t1: 4.0, at: v3(-2.3, WALL_Y + 0.1, 0.5), zh: '血管内皮', en: 'ENDOTHELIUM', dx: -80, dy: 110, hl: 150, color: '#ff9aa6' },
      { t0: 3.2, t1: 6.6, at: () => src.clone().lerp(dst, 0.45), zh: '趋化因子', en: 'CHEMOKINES', dx: 130, dy: 40, hl: 150, color: '#ff8ccc' },
      { t0: 6.4, t1: 8.8, at: () => tumors[0].group.position.clone().add(v3(-0.4, 0.8, 0.6)), zh: '肿瘤组织', en: 'TUMOUR SITE', dx: 110, dy: -90, hl: 150, color: '#ff7fb6' },
    ],
    update(t) {
      cam(S.camera, t);
      // endothelial cells part to open the junction
      const open = envelope(t, 3.4, 7.2, 1.0, 1.2);
      for (const e of endo) {
        const near = e.row === 0 && (e.i === 0 || e.i === -1);
        e.m.position.x = e.x + (near ? Math.sign(e.x) * 0.3 * open : 0);
      }
      // hero
      const p = path(t);
      hero.group.position.copy(p);
      const roll = t < 3.4 ? -p.x / HS : 0;
      hero.group.rotation.set(0, 0, roll);
      // squeeze where it crosses the wall (pinch along world y)
      hero.group.updateMatrixWorld(true);
      const wallLocal = hero.group.worldToLocal(tmp.set(p.x, WALL_Y, p.z));
      const axis = hero.group.worldToLocal(v3(p.x, p.y + 1, p.z)).sub(hero.group.worldToLocal(v3(p.x, p.y, p.z))).normalize();
      const through = envelope(t, 3.3, 6.9, 0.5, 0.6);
      hero.u.uPinchAxis.value.set(axis.x, axis.y, axis.z, wallLocal.dot(axis));
      hero.u.uPinch.value.set(0.9 * through, 0.3, 0.32);
      // adhesion glow on the membrane facing the wall
      const down = axis.clone().negate();
      hero.b.uHot.value.set(down.x, down.y, down.z, 0.35 * envelope(t, 2.6, 4.6, 0.4, 0.8));
      // chemokines
      const cp = ck.geometry.attributes.position;
      for (let i = 0; i < NCK; i++) {
        const [a, b, c, d] = ckSeed[i];
        const u = fract(a + t * 0.12 * (0.6 + b));
        tmp.copy(src).lerp(dst, u);
        const spread = 0.9 * (1 - u) + 0.25;
        cp.setXYZ(i, tmp.x + d * spread + Math.sin(t + c * 9) * 0.1, tmp.y + (c - 0.5) * spread * 0.8, tmp.z + (b - 0.5) * spread);
      }
      cp.needsUpdate = true;
      ckMat.opacity = 0.35 + 0.35 * smoothstep(1.5, 3.5, t);
      // blood above
      for (let i = 0; i < NR; i++) {
        const c = rb[i];
        pos.set(((c.x0 + t * c.sp) % 30) - 15, c.y, c.z);
        q.setFromAxisAngle(c.axis, c.ph + t);
        scl.setScalar(c.s);
        m4.compose(pos, q, scl);
        rbcs.setMatrixAt(i, m4);
      }
      rbcs.instanceMatrix.needsUpdate = true;
      tumors.forEach((c, i) => c.group.rotation.set(0, t * 0.1 + i, 0));
      S.tick(t);
    },
  };
}
