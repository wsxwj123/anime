import * as THREE from 'three';
import { createCell } from '../gfx/cell.js';
import { createMembrane } from '../gfx/membrane.js';
import { blob, tube } from '../gfx/blob.js';
import { glowSprite, color } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, lerp, rng, envelope, clamp, TAU } from '../engine/util.js';
import { buildCAR } from './car.js';
import { stage, v3 } from './shared.js';

const ANT = { deep: '#4a0c2c', mid: '#e0609a', rim: '#ffd0e6', glow: '#ff9ccb' };

// CD19-like antigen: a stalk with two Ig-like domains, pointing +Y from its base.
export function buildAntigen(L, seed = 1) {
  const g = new THREE.Group();
  const stalk = tube(L, [v3(0, 0, 0), v3(0.04, 0.35, 0.02), v3(-0.03, 0.75, 0), v3(0.02, 1.1, 0.02)], { radius: 0.05, segments: 30, radial: 8, ...ANT });
  const d1 = blob(L, seed * 3 + 1, { detail: 4, amp: 0.1, scale: [0.24, 0.3, 0.22] }, { ...ANT });
  d1.position.set(0.02, 0.95, 0);
  const d2 = blob(L, seed * 3 + 2, { detail: 4, amp: 0.1, scale: [0.25, 0.32, 0.23] }, { ...ANT, glowAmt: 0.1 });
  d2.position.set(-0.02, 1.48, 0.02);
  g.add(stalk, d1, d2);
  g.userData.top = d2;
  return g;
}

// ---------------------------------------------------------------- approach
export function approach(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.45, 0.75, 0.6], key: '#fff0ea', keyIntensity: 1.2, fill: '#221428', fillIntensity: 0.75, back: '#ffb0d0', backIntensity: 0.8 },
    backdrop: { inner: '#1c0c24', outer: '#030106', accent: '#3a1038', accentAmt: 0.5, center: [0.58, 0.48] },
    dust: [{ count: 500, box: [20, 12, 16], tint: '#ffb8e0', tint2: '#9fe8ff', size: 0.03, focus: 6, aperture: 1.3, opacity: 0.45, seed: 171 }],
  });
  const r = rng(181);
  const tumor = S.add(
    createCell({ lights: S.L, palette: 'tumor', seed: 800, detail: 52, disp: 0.1, dispFreq: 1.1, villi: 0.016, receptors: { kind: 'antigen', count: 320, length: 0.12 }, nucleus: { offset: [0.1, 0.05, -0.1], radius: 0.6, vis: 0.4 }, haloSize: 3, haloOpacity: 0.22 }),
  );
  const RB = 1.35;
  tumor.group.position.set(1.4, 0, 0);
  tumor.group.scale.setScalar(RB);
  tumor.b.uGlow.value = 0.12;
  const bg = [];
  for (let i = 0; i < 5; i++) {
    const c = S.add(createCell({ lights: S.L, palette: 'tumor', seed: 810 + i, detail: 24, disp: 0.1, villi: 0, haloOpacity: 0.12 }));
    c.group.position.set(r.range(-6, 9), r.range(-4, 4), r.range(-12, -6));
    c.group.scale.setScalar(r.range(1.1, 1.6));
    c.b.uSoft.value = 0.9;
    c.b.uTexScale.value = 0.3;
    c.b.uDeep.value.multiplyScalar(0.5);
    c.b.uMid.value.multiplyScalar(0.4);
    bg.push(c);
  }
  const RA = 0.9;
  const tc = S.add(createCell({ lights: S.L, palette: 'tcell', seed: 820, detail: 48, disp: 0.07, villi: 0.018, receptors: { kind: 'car', count: 230, length: 0.15 }, haloSize: 3, haloOpacity: 0.2 }));
  tc.group.scale.setScalar(RA);
  tc.b.uGlow.value = 0.14;
  tc.rec.userData.u.uGlow.value = 0.18;
  const dir = v3(1, -0.08, -0.15).normalize();
  const B = tumor.group.position.clone();
  const contactD = (RA + RB) * 0.93;
  const Afinal = B.clone().addScaledVector(dir, -contactD);
  const Astart = v3(-5.2, 1.1, 1.2);

  const cam = camPath(
    [
      { t: 0, p: [-1.6, 1.0, 7.6], l: [-0.4, 0.15, 0], fov: 32 },
      { t: 6.4, p: [-0.3, 0.45, 3.9], l: [0.15, 0.1, 0.05], fov: 30 },
    ],
    { shake: 0.012 },
  );
  const P = v3(0, 0, 0);
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 6,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.8, radius: 0.6, threshold: 0.74 },
    labels: [
      { t0: 0.8, t1: 3.8, at: () => B.clone().add(v3(0.6, 1.25, 0.3)), zh: '肿瘤细胞', en: 'TUMOR CELL', dx: 110, dy: -80, hl: 150, color: '#ff7fb6' },
      { t0: 1.2, t1: 4.0, at: () => tc.group.position.clone().add(v3(-0.4, -0.7, 0.3)), zh: 'CAR-T 细胞', en: 'CAR-T CELL', dx: -110, dy: 90, hl: 150, color: '#7fe6ff' },
    ],
    update(t) {
      cam(S.camera, t);
      const k = prog(t, 0, 3.4, ease.outCubic);
      const A = Astart.clone().lerp(Afinal, k);
      A.y += Math.sin(t * 1.3) * 0.12 * (1 - k);
      A.z += Math.cos(t * 1.1) * 0.1 * (1 - k);
      const press = smoothstep(3.2, 5.5, t) * 0.06;
      A.addScaledVector(dir, press);
      tc.group.position.copy(A);
      tc.group.rotation.set(t * 0.15, t * 0.25 - k * 1.5, 0);
      tumor.group.rotation.set(0, t * 0.05, 0);
      // contact interface at the proportional split point
      const D = A.distanceTo(B);
      P.copy(A).lerp(B, RA / (RA + RB));
      const touching = D < RA + RB + 0.05;
      if (touching) {
        tc.contactToward(0, P, 0);
        tumor.contactToward(0, P, 0);
      } else {
        tc.contact(0, [0, 1, 0], 9);
        tumor.contact(0, [0, 1, 0], 9);
      }
      const bind = smoothstep(3.1, 4.6, t);
      tc.group.updateMatrixWorld(true);
      const la = tc.group.worldToLocal(P.clone()).normalize();
      tc.rec.userData.u.uBindDir.value.set(la.x, la.y, la.z, bind);
      tumor.group.updateMatrixWorld(true);
      const lb = tumor.group.worldToLocal(P.clone()).normalize();
      tumor.rec.userData.u.uBindDir.value.set(lb.x, lb.y, lb.z, bind);
      tumor.b.uHot.value.set(lb.x, lb.y, lb.z, 0.25 * bind);
      tc.b.uHot.value.set(la.x, la.y, la.z, 0.3 * bind);
      bg.forEach((c, i) => c.group.rotation.set(0, t * 0.05 + i, 0));
      S.tick(t);
    },
  };
}

// ---------------------------------------------------------------- binding (molecular)
export function binding(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.4, 0.6, 0.7], key: '#fff2ea', keyIntensity: 1.2, fill: '#1c1426', fillIntensity: 0.8, back: '#ffb0d8', backIntensity: 0.7 },
    backdrop: { inner: '#170d24', outer: '#020104', accent: '#2a1240', accentAmt: 0.5, center: [0.5, 0.5] },
    dust: [{ count: 380, box: [18, 10, 14], tint: '#ffc8e8', tint2: '#ffe0a0', size: 0.022, focus: 7, aperture: 1.3, opacity: 0.4, seed: 191 }],
  });
  const BOT = -2.35;
  const top = createMembrane(S.L, { radius: 6.5, spacing: 0.15, curv: 0.004, amp: 0.02, head: '#4f8aa2', innerHead: '#3f6f86', headRim: '#b8ecff', tail: '#28495a', fogNear: 5, fogFar: 14, fogColor: '#05030a', seed: 3 });
  top.rotation.x = Math.PI;
  S.scene.add(top);
  const bot = createMembrane(S.L, { radius: 6.5, spacing: 0.15, curv: 0.004, amp: 0.02, head: '#a8507a', innerHead: '#80385a', headRim: '#ffc0dc', tail: '#4a2036', fogNear: 5, fogFar: 14, fogColor: '#05030a', seed: 4 });
  bot.position.y = BOT;
  S.scene.add(bot);

  const r = rng(201);
  const K = 0.62;
  const xs = [-2.7, -1.35, 0.05, 1.3, 2.6, -2.0, -0.4, 1.9];
  const zs = [0.8, -0.7, 0.2, -1.1, 0.5, -2.6, -2.9, -2.4];
  const cars = xs.map((x, i) => {
    const g = buildCAR(S.L).g;
    g.scale.setScalar(K);
    g.rotation.set(Math.PI, r.range(0, TAU), 0);
    S.scene.add(g);
    return { g, x, z: zs[i], lag: [0.25, 0.1, 0.0, 0.18, 0.32, 0.4, 0.06, 0.28][i] };
  });
  const ants = xs.map((x, i) => {
    const g = buildAntigen(S.L, 30 + i);
    g.position.set(x + 0.05, BOT + 0.22, zs[i]);
    g.rotation.y = r.range(0, TAU);
    S.scene.add(g);
    return g;
  });
  const flashes = xs.map(() => {
    const f = glowSprite('#ffe0f0', 0.8, 0, 1.8);
    S.scene.add(f);
    return f;
  });
  const pulses = xs.map(() => {
    const f = glowSprite('#ffe6a0', 0.45, 0, 2.2);
    S.scene.add(f);
    return f;
  });

  // scFv tip of an inverted CAR sits 2.52*K below its membrane anchor
  const TIP = 2.52 * K;
  const ANT_TOP = BOT + 0.22 + 1.72;
  const TOP = ANT_TOP + 0.02 + TIP;
  const gap0 = 0.95;

  const cam = camPath(
    [
      { t: 0, p: [3.2, -0.2, 8.4], l: [0.2, -0.5, -0.4], fov: 34 },
      { t: 6.4, p: [1.6, -0.45, 6.6], l: [0.1, -0.55, -0.3], fov: 32 },
    ],
    { shake: 0.012 },
  );
  const bindT = (c) => 2.2 + c.lag * 7;
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 6,
    transition: { type: 'cross', dur: 1.0 },
    bloom: { strength: 0.85, radius: 0.6, threshold: 0.72 },
    labels: [
      { t0: 0.7, t1: 4.0, at: () => v3(cars[1].x - 0.2, cars[1].g.position.y - TIP + 0.3, cars[1].z), zh: '嵌合抗原受体（CAR）', en: 'CHIMERIC ANTIGEN RECEPTOR', dx: -130, dy: -80, hl: 200, color: '#ffd27a' },
      { t0: 1.1, t1: 4.4, at: () => v3(xs[3] + 0.2, ANT_TOP - 0.55, zs[3]), zh: '靶抗原（如 CD19）', en: 'TARGET ANTIGEN', dx: 130, dy: 70, hl: 240, color: '#ff9ccb' },
      { t0: 3.3, t1: 5.8, at: () => v3(xs[2], ANT_TOP + 0.05, zs[2]), zh: '特异性结合', en: 'SPECIFIC BINDING', dx: 130, dy: -100, hl: 170, color: '#ffe6a0' },
    ],
    update(t) {
      cam(S.camera, t);
      // the T-cell membrane closes in, receptors latch on one by one
      const descend = prog(t, 0.2, 3.6, ease.inOutSine);
      top.position.y = TOP + gap0 * (1 - descend);
      top.userData.u.uTime.value = t;
      bot.userData.u.uTime.value = t;
      cars.forEach((c, i) => {
        const tb = bindT(c);
        // each receptor hangs a little high until it reaches down and latches
        const reach = smoothstep(tb - 0.8, tb, t);
        const want = ANT_TOP + 0.02;
        c.g.position.set(c.x, top.position.y + c.lag * 0.7 * (1 - reach), c.z);
        const fl = envelope(t, tb, tb + 1.2, 0.08, 1.0);
        flashes[i].position.set(c.x, want, c.z + 0.1);
        flashes[i].material.opacity = 0.6 * fl;
        ants[i].userData.top.userData.u.uGlow.value = 0.08 + 0.4 * smoothstep(tb, tb + 0.3, t);
        // signal climbs the receptor
        const up = (t - tb - 0.4) / 1.4;
        pulses[i].visible = up > 0 && up < 1;
        pulses[i].position.set(c.x, lerp(want, top.position.y + 1.0, clamp(up)), c.z);
        pulses[i].material.opacity = 0.9 * Math.sin(clamp(up) * Math.PI);
      });
      S.tick(t);
    },
  };
}
