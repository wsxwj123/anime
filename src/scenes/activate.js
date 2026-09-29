import * as THREE from 'three';
import { createCell, PALETTES } from '../gfx/cell.js';
import { color } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, lerp } from '../engine/util.js';
import { stage, v3 } from './shared.js';

const BEAD = { deep: '#140f0b', mid: '#5a4a3c', rim: '#d9bf9a', glow: '#ffcf8a', nucleus: '#000000' };

// Anti-CD3/CD28 beads dock on a resting T cell; it wakes up, swells and brightens.
export function activate(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.5, 0.75, 0.55], key: '#fff3e6', keyIntensity: 1.2, fill: '#172a40', fillIntensity: 0.65, back: '#8fe6ff' },
    backdrop: { inner: '#0c2034', outer: '#010207', accent: '#12324a', accentAmt: 0.45, center: [0.52, 0.5] },
    dust: [{ count: 420, box: [24, 14, 24], tint: '#a6dcff', tint2: '#ffe0b0', size: 0.035, focus: 6.5, aperture: 1.0, opacity: 0.55, seed: 21 }],
  });

  const cell = S.add(
    createCell({
      lights: S.L,
      palette: 'tcellRest',
      seed: 5,
      detail: 48,
      disp: 0.05,
      villi: 0.02,
      receptors: { kind: 'tcr', count: 170, length: 0.1 },
      nucleus: { offset: [0.1, 0.05, -0.12], radius: 0.6, vis: 0.35 },
      haloSize: 3.0,
      haloOpacity: 0.12,
    }),
  );
  const rest = PALETTES.tcellRest;
  const act = PALETTES.tcell;
  const pal = {
    deep: [color(rest.deep), color(act.deep)],
    mid: [color(rest.mid), color(act.mid)],
    rim: [color(rest.rim), color(act.rim)],
  };

  const dirs = [
    v3(0.78, 0.5, 0.38).normalize(),
    v3(-0.86, -0.28, 0.42).normalize(),
    v3(0.15, -0.55, -0.82).normalize(),
  ];
  const dock = [2.4, 3.2, 4.0];
  const BR = 0.6;
  const beads = dirs.map((d, i) => {
    const b = S.add(
      createCell({
        lights: S.L,
        palette: BEAD,
        seed: 40 + i,
        detail: 40,
        disp: 0.012,
        villi: 0,
        receptors: { kind: 'antibody', count: 110, length: 0.2, sway: 0.1 },
        haloOpacity: 0.0,
        spec: 1.1,
        gloss: 60,
        rimAmt: 0.6,
        texScale: 0.6,
      }),
    );
    b.group.scale.setScalar(BR);
    b.rec.userData.u.uGlow.value = 0.05;
    return { b, d, from: d.clone().multiplyScalar(6.5 + i).add(v3(0.8 * (i - 1), 1.2, -0.5)), t: dock[i] };
  });

  const cam = camPath(
    [
      { t: 0, p: [0.9, 0.55, 8.2], l: [0.1, 0.05, 0], fov: 33 },
      { t: 4.4, p: [2.2, 1.2, 5.3], l: [0.45, 0.3, 0.1], fov: 31 },
      { t: 11.5, p: [-0.6, 0.5, 7.2], l: [0.05, 0.0, 0], fov: 33 },
    ],
    { shake: 0.018 },
  );

  const tmp = new THREE.Vector3();
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 11,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.8, radius: 0.55, threshold: 0.74 },
    labels: [
      { t0: 1.2, t1: 5.6, at: () => beads[0].b.group.position.clone().add(v3(0.25, 0.4, 0.2)), zh: '抗 CD3/CD28 磁珠', en: 'ACTIVATION BEAD', dx: 110, dy: -80, hl: 230, color: '#e8c47f' },
      { t0: 1.8, t1: 5.8, at: () => cell.group.position.clone().add(v3(-0.5, 0.72, 0.45)), zh: '静息 T 细胞', en: 'RESTING T CELL', dx: -130, dy: -70, hl: 170, color: '#9fd0e0' },
      { t0: 7.2, t1: 10.8, at: () => cell.group.position.clone().add(v3(-0.8, 0.55, 0.5)), zh: '活化的 T 细胞', en: 'ACTIVATED T CELL', dx: -120, dy: -90, hl: 190, color: '#7fe6ff' },
    ],
    update(t) {
      cam(S.camera, t);
      const a = prog(t, 4.0, 8.6, ease.inOutSine);
      const sc = lerp(0.92, 1.14, a) * (1 + 0.012 * Math.sin(t * 2.2) * a);
      cell.group.scale.setScalar(sc);
      cell.group.rotation.set(0.1, t * 0.08, 0.05);
      const b = cell.b;
      b.uDeep.value.copy(pal.deep[0]).lerp(pal.deep[1], a);
      b.uMid.value.copy(pal.mid[0]).lerp(pal.mid[1], a);
      b.uRim.value.copy(pal.rim[0]).lerp(pal.rim[1], a);
      b.uGlow.value = 0.02 + 0.2 * a + 0.1 * a * (0.5 + 0.5 * Math.sin(t * 3.0));
      cell.u.uDisp.value = lerp(0.045, 0.085, a);
      cell.u.uDispSpeed.value = lerp(0.08, 0.2, a);
      cell.b.uNucVis.value = 0.35 + 0.2 * a;
      cell.halo.material.opacity = 0.1 + 0.18 * a;
      cell.group.updateMatrixWorld(true);

      // Beads: glide in, dock, ride along with the cell as it grows.
      let pulseT = -1;
      let pulseDir = null;
      beads.forEach(({ b: bead, d, from, t: td }, i) => {
        const k = prog(t, td - 2.6, td, ease.outCubic);
        const rest = d.clone().multiplyScalar(sc + BR * 0.9);
        bead.group.position.copy(from).lerp(rest, k);
        bead.group.rotation.set(t * 0.2 + i, t * 0.15, 0);
        const docked = t >= td - 0.15;
        const local = cell.group.worldToLocal(tmp.copy(bead.group.position));
        const dist = local.length();
        cell.contact(i, [local.x / dist, local.y / dist, local.z / dist], docked ? dist - (BR * 0.93) / sc : 9);
        if (t >= td && (pulseT < 0 || td > pulseT)) {
          pulseT = td;
          pulseDir = local.clone().normalize();
        }
      });
      if (pulseDir) {
        const ph = (t - pulseT) * 1.4;
        b.uPulse.value.set(pulseDir.x, pulseDir.y, pulseDir.z, ph);
        b.uPulseAmt.value = 0.9 * (1 - smoothstep(0.6, 2.8, ph));
      } else b.uPulseAmt.value = 0;
      S.tick(t);
    },
  };
}
