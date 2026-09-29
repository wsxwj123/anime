import { intro } from './intro.js';
import { lookdev } from './lookdev.js';
import { collect } from './collect.js';
import { activate } from './activate.js';
import { transduceA, transduceB, transduceC } from './transduce.js';
import { car } from './car.js';
import { expand } from './expand.js';
import { infuseBag, infuseVein } from './infuse.js';
import { vessel, extravasate } from './traffic.js';
import { approach, binding } from './recognize.js';
import { synapse, perforin, apoptosis } from './kill.js';
import { serial } from './serial.js';
import { memory } from './memory.js';
import { createCell } from '../gfx/cell.js';
import { camPath } from '../engine/camera.js';
import { stage } from './shared.js';

// Temporary stand-in used while a shot is being built.
function placeholder(duration, palette = 'tcell') {
  return (ctx) => {
    const S = stage(ctx, { dust: [{ count: 200, seed: 5 }] });
    const c = S.add(createCell({ lights: S.L, palette, seed: 4, detail: 32 }));
    const cam = camPath([{ t: 0, p: [0, 0, 6], l: [0, 0, 0] }]);
    return {
      scene: S.scene,
      camera: S.camera,
      duration,
      transition: { type: 'cross', dur: 1 },
      labels: [],
      update(t) {
        cam(S.camera, t);
        c.group.rotation.y = t * 0.2;
        S.tick(t);
      },
    };
  };
}

export const SHOTS = {
  intro,
  lookdev,
  collect,
  activate,
  transduceA,
  transduceB,
  transduceC,
  car,
  expand,
  infuseBag,
  infuseVein,
  vessel,
  extravasate,
  approach,
  binding,
  synapse,
  perforin,
  apoptosis,
  serial,
  memory,
};
