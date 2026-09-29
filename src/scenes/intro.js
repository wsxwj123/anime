import { createCell } from '../gfx/cell.js';
import { glowSprite } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, rng } from '../engine/util.js';
import { stage } from './shared.js';

// Title: one finished CAR-T cell turning slowly in the dark, a few distant
// cells out of focus behind it.
export function intro(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.55, 0.65, 0.6], key: '#ffe9d2', keyIntensity: 1.2, fill: '#10233a', fillIntensity: 0.6, back: '#8fe6ff' },
    backdrop: { inner: '#0a1e33', outer: '#010207', accent: '#0f3550', accentAmt: 0.5, center: [0.7, 0.52] },
    dust: [
      { count: 520, box: [26, 14, 26], tint: '#9fd8ff', tint2: '#ffd9a0', size: 0.035, focus: 7.2, aperture: 0.9, opacity: 0.6, seed: 2 },
    ],
  });

  const hero = S.add(
    createCell({
      lights: S.L,
      palette: 'tcell',
      seed: 3,
      detail: 64,
      disp: 0.055,
      villi: 0.018,
      receptors: { kind: 'car', count: 260, length: 0.15 },
      nucleus: { offset: [0.12, 0.08, -0.05], radius: 0.56, vis: 0.5 },
      haloSize: 3.2,
      haloOpacity: 0.2,
    }),
  );
  hero.group.position.set(1.5, 0.05, 0);
  hero.b.uGlow.value = 0.04;
  hero.rec.userData.u.uGlow.value = 0.07;

  // Distant companions, dim and soft.
  const r = rng(9);
  const far = [];
  for (let i = 0; i < 5; i++) {
    const c = S.add(
      createCell({
        lights: S.L,
        palette: 'tcell',
        seed: 20 + i,
        detail: 20,
        villi: 0,
        receptors: { kind: 'car', count: 80, length: 0.14 },
        haloOpacity: 0.12,
      }),
    );
    c.group.position.set(r.range(3, 16), r.range(-6, 6), r.range(-30, -18));
    c.group.scale.setScalar(r.range(0.9, 1.4));
    c.b.uDeep.value.multiplyScalar(0.3);
    c.b.uMid.value.multiplyScalar(0.25);
    c.b.uRimAmt.value = 0.5;
    c.b.uSoft.value = 0.9;
    c.rec.visible = false;
    far.push({ c, spin: r.range(-0.2, 0.2), bob: r.range(0, 6), y: c.group.position.y });
  }

  const flare = glowSprite('#7fe6ff', 7, 0.08, 1);
  flare.position.set(2.6, 1.2, -2);
  S.scene.add(flare);

  const cam = camPath(
    [
      { t: 0, p: [0.4, 0.25, 9.6], l: [0.9, 0.05, 0], fov: 34 },
      { t: 10, p: [0.95, 0.12, 6.9], l: [1.1, 0.05, 0], fov: 32 },
    ],
    { shake: 0.02 },
  );

  return {
    scene: S.scene,
    camera: S.camera,
    duration: 9,
    transition: { type: 'cut' },
    exposure: (t) => 0.35 + 0.75 * prog(t, 0, 3.5, ease.outCubic),
    bloom: { strength: 0.72, radius: 0.6, threshold: 0.72 },
    labels: [],
    update(t) {
      cam(S.camera, t);
      hero.group.rotation.set(0.25 + 0.04 * Math.sin(t * 0.3), -0.6 + t * 0.09, 0.1);
      hero.group.position.y = 0.05 + 0.05 * Math.sin(t * 0.5);
      hero.rec.userData.u.uAppear.value = 1;
      for (const f of far) {
        f.c.group.rotation.y = t * f.spin;
        f.c.group.position.y = f.y + Math.sin(t * 0.3 + f.bob) * 0.15;
      }
      flare.material.opacity = 0.06 + 0.02 * Math.sin(t * 0.7);
      S.tick(t);
    },
  };
}
