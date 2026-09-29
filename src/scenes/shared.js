import * as THREE from 'three';
import { makeLights, makeBackdrop } from '../gfx/common.js';
import { createDust } from '../gfx/particles.js';
import { makeCamera } from '../engine/camera.js';

// Boilerplate every shot shares: scene, camera, lights, backdrop, dust layers.
export function stage(ctx, { lights = {}, backdrop = {}, dust = [], fov = 35 } = {}) {
  const scene = new THREE.Scene();
  const camera = makeCamera(fov);
  const L = makeLights(lights);
  const bg = makeBackdrop(backdrop);
  scene.add(bg);
  const dusts = dust.map((d) => {
    const p = createDust(d);
    scene.add(p);
    return p;
  });
  const cells = [];
  return {
    scene,
    camera,
    L,
    bg,
    dusts,
    cells,
    add(o) {
      scene.add(o.group || o);
      if (o.update && o.group) cells.push(o);
      return o;
    },
    // Per-frame common updates; call after moving the camera.
    tick(t) {
      bg.userData.uniforms.uTime.value = t;
      for (const d of dusts) d.userData.update(t, camera, ctx.renderer);
      for (const c of cells) c.update(t, camera);
    },
  };
}

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
