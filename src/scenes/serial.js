import * as THREE from 'three';
import { createCell } from '../gfx/cell.js';
import { createCrowd } from '../gfx/crowd.js';
import { glowSprite, color } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, lerp, rng, envelope, clamp, TAU } from '../engine/util.js';
import { stage, v3 } from './shared.js';

const RT = 0.62; // CAR-T radius
const RB = 0.9; // tumour radius
const KILL = 1.8; // attach → break-up
const MITOSIS = 1.1;

// Three CAR-T cells work through a cluster of tumour cells one after another,
// multiplying as they go.
export function serial(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.4, 0.85, 0.45], key: '#fff0ea', keyIntensity: 1.2, fill: '#1e1428', fillIntensity: 0.8, back: '#ffb0d0', backIntensity: 0.7 },
    backdrop: { inner: '#1a0c22', outer: '#020104', accent: '#301036', accentAmt: 0.45, center: [0.5, 0.45] },
    dust: [{ count: 500, box: [26, 14, 22], tint: '#ffb8e0', tint2: '#9fe8ff', size: 0.035, focus: 11, aperture: 1.2, opacity: 0.4, seed: 271 }],
  });
  const r = rng(281);
  const TP = [v3(-3.5, 0.0, -0.4), v3(-1.1, -1.3, 0.9), v3(1.0, 0.4, -0.7), v3(3.2, -0.75, 0.5), v3(-2.3, 1.3, -2.6), v3(0.1, -2.3, -1.9), v3(2.0, 1.4, -2.4)];
  const tumors = TP.map((p, i) => {
    const c = S.add(createCell({ lights: S.L, palette: 'tumor', seed: 1000 + i, detail: 44, disp: 0.1, villi: 0.012, receptors: { kind: 'antigen', count: 160, length: 0.13 }, haloSize: 3, haloOpacity: 0.2 }));
    c.group.position.copy(p);
    c.group.scale.setScalar(RB);
    return { c, p, die: Infinity, from: null };
  });

  const plans = [
    { start: v3(-6.2, -0.8, 2.0), visits: [{ tum: 0, arrive: 1.3, leave: 3.4 }, { tum: 4, arrive: 4.6, leave: 6.7 }, { tum: 1, arrive: 8.2, leave: 10.3 }], divide: 10.4, exit: v3(-1.6, -2.4, 2.6) },
    { start: v3(0.2, 3.0, 2.4), visits: [{ tum: 2, arrive: 1.8, leave: 5.5 }, { tum: 6, arrive: 6.8, leave: 8.9 }], divide: 4.1, exit: v3(3.6, 0.4, 1.6) },
    { start: v3(5.6, -2.6, 1.6), visits: [{ tum: 3, arrive: 1.6, leave: 3.7 }, { tum: 5, arrive: 5.2, leave: 7.3 }], divide: 7.6, exit: v3(2.2, -3.4, 1.4) },
  ];
  // contact points and death times follow from the plan
  for (const pl of plans) {
    let prev = pl.start;
    for (const v of pl.visits) {
      const T = tumors[v.tum];
      const d = prev.clone().sub(T.p).normalize();
      v.at = T.p.clone().addScaledVector(d, (RT + RB) * 0.9);
      v.dir = d;
      T.die = v.arrive + KILL;
      T.contactFrom = d;
      T.attach = v.arrive;
      prev = v.at;
    }
  }

  const mkT = (seed) => {
    const c = S.add(createCell({ lights: S.L, palette: 'tcell', seed, detail: 48, disp: 0.07, villi: 0.018, receptors: { kind: 'car', count: 170, length: 0.15 }, haloSize: 3, haloOpacity: 0.2 }));
    c.group.scale.setScalar(RT);
    c.b.uGlow.value = 0.16;
    c.rec.userData.u.uGlow.value = 0.18;
    c.u.uPinch.value.set(0, 0.34, 0.04);
    return c;
  };
  const cars = plans.map((pl, i) => ({ pl, c: mkT(1100 + i), d: mkT(1110 + i), axis: v3(...r.dir()).setY(0.3).normalize(), drift: v3(...r.dir()).multiplyScalar(0.25) }));

  // apoptotic debris (one crowd for all)
  const PER = 7;
  const frag = createCrowd(S.L, TP.length * PER, { palette: 'tumor', detail: 10, disp: 0.18, villi: 0.0, seed: 29 });
  S.scene.add(frag);
  const fdat = TP.map(() => Array.from({ length: PER }, () => ({ d: v3(...r.dir()), s: r.range(0.16, 0.3), sp: r.range(0.18, 0.4), rot: new THREE.Euler(r() * 6, r() * 6, r() * 6) })));
  const va = frag.userData.var;
  for (let i = 0; i < TP.length * PER; i++) va.setXYZW(i, 0.7, 0, 0.55, 0);
  va.needsUpdate = true;
  const flashes = TP.map((p) => {
    const f = glowSprite('#ffb07a', 3.2, 0, 1.3);
    f.position.copy(p);
    S.scene.add(f);
    return f;
  });

  function carPos(pl, t) {
    let prev = pl.start;
    let prevT = 0;
    for (const v of pl.visits) {
      if (t < v.arrive) {
        const k = prog(t, prevT, v.arrive, ease.inOutSine);
        const p = prev.clone().lerp(v.at, k);
        p.y += Math.sin(k * Math.PI) * 0.4;
        return { p, attached: null };
      }
      if (t < v.leave) {
        const p = v.at.clone().addScaledVector(v.dir, -0.05 * smoothstep(v.arrive, v.arrive + 0.8, t));
        return { p, attached: t < v.arrive + KILL + 0.1 ? v : null };
      }
      prev = v.at;
      prevT = v.leave;
    }
    const k = prog(t, prevT, prevT + 2.4, ease.inOutSine);
    return { p: prev.clone().lerp(pl.exit, k), attached: null };
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = v3(1, 1, 1);
  const pos = v3(0, 0, 0);
  let alive = TP.length;
  let nCar = 3;

  const cam = camPath(
    [
      { t: 0, p: [-0.6, 5.6, 10.8], l: [0, -0.3, -0.6], fov: 36 },
      { t: 12.6, p: [1.8, 4.6, 10.0], l: [0.2, -0.3, -0.6], fov: 35 },
    ],
    { shake: 0.014 },
  );
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 12,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.8, radius: 0.6, threshold: 0.74 },
    labels: [],
    hud(t) {
      return {
        type: 'tally',
        rows: [
          { label: '肿瘤细胞', en: 'TUMOUR CELLS', total: TP.length, n: alive, color: '#ff7fb6' },
          { label: 'CAR-T 细胞', en: 'CAR-T CELLS', total: 6, n: nCar, color: '#7fe6ff' },
        ],
        opacity: envelope(t, 0.6, 11.6, 0.6, 0.5),
      };
    },
    update(t) {
      cam(S.camera, t);
      // tumours
      alive = 0;
      tumors.forEach((T, i) => {
        const c = T.c;
        const sick = smoothstep(T.die - KILL + 0.3, T.die, t);
        const gone = smoothstep(T.die, T.die + 0.3, t);
        if (gone < 1) alive++;
        c.opacity = 1 - gone;
        c.u.uBleb.value = 0.5 * sick;
        c.u.uDispSpeed.value = 0.1 + 0.4 * sick;
        c.b.uDark.value = 0.5 * sick;
        c.b.uGlowColor.value.set(1.0, 0.45, 0.2);
        c.b.uGlow.value = 0.3 * sick * (1 - gone);
        c.group.scale.setScalar(RB * (1 - 0.2 * sick) * (1 - 0.8 * gone));
        c.group.rotation.set(0, t * 0.05 + i, 0);
        flashes[i].material.opacity = 0.35 * envelope(t, T.die - 0.1, T.die + 1.3, 0.15, 1.0);
        // debris
        for (let j = 0; j < PER; j++) {
          const f = fdat[i][j];
          const fk = t - T.die;
          const a = fk > 0 ? smoothstep(0, 0.3, fk) * (1 - smoothstep(2.2, 3.4, fk)) : 0;
          pos.copy(T.p).addScaledVector(f.d, RB * 0.45 + Math.max(0, fk) * f.sp);
          q.setFromEuler(f.rot);
          scl.setScalar(f.s * a + 1e-4);
          m4.compose(pos, q, scl);
          frag.setMatrixAt(i * PER + j, m4);
        }
      });
      frag.instanceMatrix.needsUpdate = true;
      frag.userData.u.uTime.value = t;
      // CAR-T cells
      nCar = 0;
      cars.forEach((o) => {
        const { pl, c, d, axis, drift } = o;
        const { p, attached } = carPos(pl, t);
        const div0 = pl.divide;
        const split = div0 + MITOSIS;
        const phase = clamp((t - div0) / MITOSIS);
        c.group.rotation.set(0, 0, 0);
        c.u.uStretch.value.set(axis.x, axis.y, axis.z, t > div0 && t < split ? 0.8 * smoothstep(0, 0.75, phase) : 0);
        c.u.uPinchAxis.value.set(axis.x, axis.y, axis.z, 0);
        c.u.uPinch.value.x = t > div0 && t < split ? smoothstep(0.2, 1, phase) : 0;
        const sep = smoothstep(split, split + 1.2, t);
        if (t >= split) {
          c.group.position.copy(p).addScaledVector(axis, -lerp(0.9, 1.1, sep) * RT);
          d.group.position.copy(p).addScaledVector(axis, lerp(0.9, 1.1, sep) * RT).addScaledVector(drift, Math.max(0, t - split - 0.6));
          d.opacity = 1;
          d.group.scale.setScalar(RT * lerp(0.9, 1, sep));
          c.group.scale.setScalar(RT * lerp(0.9, 1, sep));
          nCar += 2;
        } else {
          c.group.position.copy(p);
          c.group.scale.setScalar(RT);
          d.opacity = 0;
          nCar += 1;
        }
        // synapse while attached
        if (attached && t < attached.arrive + KILL + 0.1 && t >= attached.arrive - 0.05) {
          const T = tumors[attached.tum];
          const P = c.group.position.clone().lerp(T.p, RT / (RT + RB));
          c.contactToward(0, P, 0);
          T.c.contactToward(0, P, 0);
          c.group.updateMatrixWorld(true);
          const la = c.group.worldToLocal(P.clone()).normalize();
          c.b.uHot.value.set(la.x, la.y, la.z, 0.35);
          c.rec.userData.u.uBindDir.value.set(la.x, la.y, la.z, 0.8);
        } else {
          c.contact(0, [0, 1, 0], 9);
          c.b.uHot.value.w = 0;
          c.rec.userData.u.uBindDir.value.w = 0;
        }
      });
      tumors.forEach((T) => {
        if (!(t >= T.attach - 0.05 && t < T.die + 0.1)) T.c.contact(0, [0, 1, 0], 9);
      });
      S.tick(t);
    },
  };
}
