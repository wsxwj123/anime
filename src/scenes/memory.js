import * as THREE from 'three';
import { createCell } from '../gfx/cell.js';
import { createCrowd } from '../gfx/crowd.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, rng, TAU } from '../engine/util.js';
import { stage, v3 } from './shared.js';

// Quiet coda: a few long-lived CAR-T cells patrolling healthy tissue while the
// end card comes up.
export function memory(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.4, 0.8, 0.5], key: '#f4f0ff', keyIntensity: 1.05, fill: '#141c2e', fillIntensity: 0.8, back: '#9fd8ff' },
    backdrop: { inner: '#0c1828', outer: '#010206', accent: '#10283e', accentAmt: 0.45, center: [0.5, 0.5] },
    dust: [{ count: 560, box: [30, 16, 30], tint: '#bcd8ff', tint2: '#ffe0b0', size: 0.035, focus: 7, aperture: 1.2, opacity: 0.45, seed: 291 }],
  });
  const r = rng(301);
  const N = 70;
  const tissue = createCrowd(S.L, N, { palette: { deep: '#0c1220', mid: '#34425e', rim: '#8898b8', glow: '#9fb3d6' }, detail: 14, disp: 0.08, villi: 0.01, fog: 1, fogColor: '#03070f', fogNear: 4, fogFar: 22, seed: 31 });
  S.scene.add(tissue);
  const tp = Array.from({ length: N }, () => {
    const p = v3(r.range(-15, 15), r.range(-6, 6), r.range(-22, -2.5));
    if (Math.abs(p.x) < 3 && p.z > -5) p.z -= 6;
    return { p, s: r.range(0.8, 1.3), rot: new THREE.Euler(r() * 6, r() * 6, r() * 6), ph: r() * TAU };
  });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = v3(1, 1, 1);
  const pos = v3(0, 0, 0);
  const mems = [
    { p: v3(0.2, 0.0, 0.0), v: v3(0.22, -0.1, -0.06), s: 0.58 },
    { p: v3(-3.6, 1.4, -3.5), v: v3(-0.2, 0.08, 0.02), s: 0.55 },
    { p: v3(3.8, -1.3, -5.0), v: v3(0.14, -0.08, 0.02), s: 0.55 },
    { p: v3(-2.2, -2.4, -7.5), v: v3(-0.12, -0.05, 0), s: 0.55 },
  ].map((o, i) => {
    const c = S.add(createCell({ lights: S.L, palette: 'tcell', seed: 1200 + i, detail: i === 0 ? 64 : 36, disp: 0.06, villi: 0.016, receptors: { kind: 'car', count: 200, length: 0.14 }, haloSize: 3.2, haloOpacity: 0.22 }));
    c.group.scale.setScalar(o.s);
    c.b.uGlow.value = 0.2;
    c.rec.userData.u.uGlow.value = 0.2;
    return { c, ...o };
  });
  const hero = mems[0];
  const cam = camPath(
    [
      { t: 0, p: [0.6, 0.35, 4.2], l: [0.4, 0.0, 0], fov: 32 },
      { t: 15, p: [1.6, 2.2, 12.5], l: [0.6, -0.2, -2], fov: 36 },
    ],
    { shake: 0.012 },
  );
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 14,
    transition: { type: 'cross', dur: 1.4 },
    bloom: { strength: 0.85, radius: 0.65, threshold: 0.72 },
    exposure: (t) => 1 - 0.42 * smoothstep(5.8, 8.5, t),
    labels: [{ t0: 1.2, t1: 5.6, at: () => hero.c.group.position.clone().add(v3(0.25, 0.45, 0.2)), zh: '记忆性 CAR-T 细胞', en: 'MEMORY CAR-T CELLS', dx: 120, dy: -90, hl: 230, color: '#7fe6ff' }],
    update(t) {
      cam(S.camera, t);
      for (let i = 0; i < N; i++) {
        const o = tp[i];
        pos.copy(o.p);
        pos.y += Math.sin(t * 0.2 + o.ph) * 0.15;
        q.setFromEuler(o.rot);
        scl.setScalar(o.s);
        m4.compose(pos, q, scl);
        tissue.setMatrixAt(i, m4);
      }
      tissue.instanceMatrix.needsUpdate = true;
      tissue.userData.u.uTime.value = t;
      for (const m of mems) {
        m.c.group.position.copy(m.p).addScaledVector(m.v, t);
        m.c.group.rotation.set(t * 0.12, t * 0.18, 0);
        m.c.b.uGlow.value = 0.16 + 0.06 * Math.sin(t * 1.2 + m.p.x);
      }
      S.tick(t);
    },
  };
}
