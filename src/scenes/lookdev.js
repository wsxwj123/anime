import { createCell } from '../gfx/cell.js';
import { camPath } from '../engine/camera.js';
import { stage } from './shared.js';

// Material test sheet (not part of the film): ?capture=1&lookdev=1
export function lookdev(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.55, 0.65, 0.6] },
    backdrop: { inner: '#0a1e33', outer: '#010207' },
    dust: [{ count: 200, seed: 2 }],
  });
  const defs = [
    { palette: 'tcell', receptors: { kind: 'car', count: 240, length: 0.15 }, nucleus: { vis: 0.5 } },
    { palette: 'tcellRest', receptors: { kind: 'tcr', count: 160, length: 0.1 } },
    { palette: 'tumor', receptors: { kind: 'antigen', count: 220, length: 0.13 }, disp: 0.09, nucleus: { vis: 0.5, radius: 0.6 } },
    { palette: 'wbc', villi: 0.02 },
    { palette: 'healthy' },
    { palette: 'endo' },
  ];
  const cells = defs.map((d, i) => {
    const c = S.add(createCell({ lights: S.L, seed: 3 + i, detail: 56, ...d }));
    c.group.position.set(((i % 3) - 1) * 2.6, i < 3 ? 1.25 : -1.35, 0);
    return c;
  });
  const cam = camPath([{ t: 0, p: [0, 0, 9.5], l: [0, 0, 0], fov: 38 }], { shake: 0 });
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 10,
    labels: [],
    update(t) {
      cam(S.camera, t);
      cells.forEach((c, i) => (c.group.rotation.y = t * 0.2 + i));
      S.tick(t);
    },
  };
}
