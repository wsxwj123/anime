import * as THREE from 'three';
import { glassMaterial, blobMaterial } from '../gfx/blob.js';
import { createRBCs } from '../gfx/rbc.js';
import { createCrowd } from '../gfx/crowd.js';
import { glowSprite, glowTexture, color } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, lerp, rng, envelope, clamp, TAU, fract } from '../engine/util.js';
import { stage, v3 } from './shared.js';

// Soft pillow-shaped infusion bag.
function bagGeometry(w = 1.0, h = 1.5, d = 0.3) {
  const g = new THREE.SphereGeometry(1, 72, 56);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const sx = Math.sign(x) * Math.pow(Math.abs(x), 0.42);
    const sy = Math.sign(y) * Math.pow(Math.abs(y), 0.34);
    const puff = 1 - 0.55 * Math.pow(Math.max(Math.abs(sx), Math.abs(sy)), 6);
    p.setXYZ(i, sx * w, sy * h, z * d * puff);
  }
  g.computeVertexNormals();
  return g;
}

// Label printed on the bag (drawn once the web fonts are ready).
function bagLabel() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 400;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let drawn = false;
  const draw = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 640, 400);
    g.fillStyle = 'rgba(236, 244, 250, 0.9)';
    g.fillRect(20, 20, 600, 360);
    g.strokeStyle = 'rgba(200, 160, 90, 0.95)';
    g.lineWidth = 3;
    g.strokeRect(36, 36, 568, 328);
    g.fillStyle = '#14202c';
    g.font = '300 118px Jost, "Noto Sans SC", sans-serif';
    g.textBaseline = 'alphabetic';
    g.fillText('CAR-T', 64, 170);
    g.fillStyle = '#b8883a';
    g.fillRect(66, 200, 90, 3);
    g.fillStyle = '#26323e';
    g.font = '500 34px "Noto Sans SC", sans-serif';
    g.fillText('自体 CAR-T 细胞', 64, 262);
    g.font = '400 22px Jost, "Noto Sans SC", sans-serif';
    g.fillStyle = '#5a6672';
    g.fillText('AUTOLOGOUS  ·  FOR IV INFUSION', 64, 318);
    tex.needsUpdate = true;
  };
  if (document.fonts) {
    document.fonts.load('300 118px Jost');
    document.fonts.load('500 34px "Noto Sans SC"', '自体细胞');
  }
  return {
    tex,
    ensure() {
      if (drawn) return;
      if (!document.fonts || document.fonts.status === 'loaded') {
        draw();
        drawn = true;
      }
    },
  };
}

function flowPoints(n, seed, tint = '#6fe0ff', size = 0.07) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ color: color(tint, 1.8), size, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  const r = rng(seed);
  pts.userData.seed = Array.from({ length: n }, () => [r(), r(), r(), r()]);
  return pts;
}

// ---------------------------------------------------------------- bag
export function infuseBag(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.4, 0.7, 0.7], key: '#fff4ea', keyIntensity: 1.2, fill: '#1a2436', fillIntensity: 0.7, back: '#aee8ff' },
    backdrop: { inner: '#152234', outer: '#020306', accent: '#1f3a52', accentAmt: 0.45, center: [0.52, 0.42] },
    dust: [{ count: 300, box: [16, 12, 12], tint: '#cfe8ff', size: 0.03, focus: 6, aperture: 1.2, opacity: 0.4, seed: 101 }],
  });
  const BAG = v3(0, 2.2, 0);
  const shell = new THREE.Mesh(bagGeometry(1.0, 1.45, 0.3), glassMaterial({ tint: '#d8ecff', edge: 1.0, face: 0.03, streak: 0.8 }));
  shell.position.copy(BAG);
  S.scene.add(shell);
  const liquid = new THREE.Mesh(
    bagGeometry(0.95, 1.36, 0.26),
    blobMaterial(S.L, { deep: '#3a2410', mid: '#e8b070', rim: '#ffe0b0', transparent: true, opacity: 0.22, depthWrite: false, spec: 0.3, glow: '#ffb060', glowAmt: 0.05 }),
  );
  liquid.position.copy(BAG).add(v3(0, -0.05, 0));
  S.scene.add(liquid);
  const inner = glowSprite('#7fe6ff', 3.2, 0.18, 1);
  inner.position.copy(BAG);
  S.scene.add(inner);

  // suspended cells
  const NC = 900;
  const cells = flowPoints(NC, 5, '#6fe0ff', 0.055);
  S.scene.add(cells);
  const golds = flowPoints(160, 6, '#ffc860', 0.05);
  S.scene.add(golds);

  // label
  const lab = bagLabel();
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.656), new THREE.MeshBasicMaterial({ map: lab.tex, color: color('#ffffff', 0.62), transparent: true, opacity: 0.95, toneMapped: false }));
  label.position.copy(BAG).add(v3(0, 0.55, 0.3));
  label.rotation.x = -0.05;
  S.scene.add(label);
  // hanger
  const hang = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 10, 40), glassMaterial({ tint: '#e8f4ff', edge: 1.4, face: 0.2 }));
  hang.position.copy(BAG).add(v3(0, 1.62, 0));
  S.scene.add(hang);

  // port, drip chamber, line
  const glass = glassMaterial({ tint: '#d8ecff', edge: 1.1, face: 0.05, streak: 0.7 });
  const port = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 20, 1, true), glass);
  port.position.copy(BAG).add(v3(0, -1.55, 0));
  S.scene.add(port);
  const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.6, 32, 1, false), glass);
  chamber.position.set(0, 0.05, 0);
  S.scene.add(chamber);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.11, 0.16, 32), blobMaterial(S.L, { deep: '#203040', mid: '#a8d8f0', rim: '#e8fbff', transparent: true, opacity: 0.35, glow: '#7fe6ff', glowAmt: 0.3 }));
  pool.position.set(0, -0.16, 0);
  S.scene.add(pool);
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), blobMaterial(S.L, { deep: '#203040', mid: '#bfe8ff', rim: '#ffffff', glow: '#7fe6ff', glowAmt: 0.8 }));
  S.scene.add(drop);
  const linePts = [v3(0, -0.25, 0), v3(0.02, -1.2, 0.1), v3(0.3, -2.6, 0.6), v3(1.1, -3.9, 1.5), v3(2.4, -4.8, 2.6), v3(4.2, -5.3, 3.6)];
  const curve = new THREE.CatmullRomCurve3(linePts);
  const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.045, 12, false), glass);
  S.scene.add(line);
  const lineCells = flowPoints(220, 7, '#7fe6ff', 0.085);
  S.scene.add(lineCells);

  const cam = camPath(
    [
      { t: 0, p: [0.9, 2.6, 3.9], l: [0, 2.45, 0], fov: 32 },
      { t: 3.3, p: [1.1, 1.5, 7.0], l: [0, 1.2, 0], fov: 34 },
      { t: 7.6, p: [1.5, -0.9, 3.6], l: [0.25, -1.0, 0.2], fov: 32 },
    ],
    { shake: 0.012 },
  );
  const tmp = v3(0, 0, 0);
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 6.5,
    transition: { type: 'cross', dur: 1.4 },
    bloom: { strength: 0.8, radius: 0.6, threshold: 0.74 },
    labels: [{ t0: 2.4, t1: 5.8, at: () => BAG.clone().add(v3(0.85, -0.5, 0.25)), zh: 'CAR-T 细胞制剂', en: 'CAR-T CELL PRODUCT', dx: 120, dy: 60, hl: 220, color: '#7fe6ff' }],
    update(t) {
      cam(S.camera, t);
      lab.ensure();
      const sway = 0.03 * Math.sin(t * 0.6);
      shell.rotation.z = sway;
      liquid.rotation.z = sway;
      // cells drifting inside the bag
      const p = cells.geometry.attributes.position;
      cells.userData.seed.forEach(([a, b, c, d], i) => {
        const x = (a * 2 - 1) * 0.82 + Math.sin(t * 0.3 + d * 9) * 0.05;
        const y = (b * 2 - 1) * 1.2 + Math.sin(t * 0.22 + c * 7) * 0.06 - 0.05;
        const z = (c * 2 - 1) * 0.16;
        p.setXYZ(i, BAG.x + x, BAG.y + y * (1 - 0.1 * Math.abs(x)), BAG.z + z);
      });
      p.needsUpdate = true;
      const pg = golds.geometry.attributes.position;
      golds.userData.seed.forEach(([a, b, c, d], i) => {
        pg.setXYZ(i, BAG.x + (a * 2 - 1) * 0.8, BAG.y + (b * 2 - 1) * 1.15 + Math.sin(t * 0.25 + d * 5) * 0.05, BAG.z + (c * 2 - 1) * 0.15);
      });
      pg.needsUpdate = true;
      // drip
      const ph = fract(t * 0.9);
      drop.position.set(0, lerp(0.3, -0.08, ph * ph), 0);
      drop.scale.setScalar(ph < 0.08 ? ph / 0.08 : 1);
      // cells running down the line
      const lp = lineCells.geometry.attributes.position;
      lineCells.userData.seed.forEach(([a, b, c], i) => {
        const u = fract(a + t * 0.09 * (0.8 + 0.4 * b));
        curve.getPointAt(u, tmp);
        lp.setXYZ(i, tmp.x + (c - 0.5) * 0.03, tmp.y, tmp.z + (b - 0.5) * 0.03);
      });
      lp.needsUpdate = true;
      S.tick(t);
    },
  };
}

// ---------------------------------------------------------------- vein
export function infuseVein(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.3, 0.8, 0.6], key: '#fff0e8', keyIntensity: 1.15, fill: '#2a1418', fillIntensity: 0.7, back: '#ff9a9a', backIntensity: 0.8 },
    backdrop: { inner: '#2a0d16', outer: '#030104', accent: '#4a1420', accentAmt: 0.45, center: [0.5, 0.5] },
    dust: [{ count: 360, box: [26, 12, 14], tint: '#ffb0b0', tint2: '#9fe8ff', size: 0.03, focus: 7, aperture: 1.2, opacity: 0.35, seed: 111 }],
  });
  const R = 1.25;
  const LEN = 40;
  const vein = new THREE.Mesh(new THREE.CylinderGeometry(R, R, LEN, 64, 1, true), glassMaterial({ tint: '#ff7a86', edge: 1.0, face: 0.05, streak: 0.4 }));
  vein.rotation.z = Math.PI / 2;
  S.scene.add(vein);
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.02, R * 1.02, LEN, 64, 1, true),
    blobMaterial(S.L, { deep: '#1a0206', mid: '#6a1a24', rim: '#ff8a8a', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.BackSide, spec: 0.1 }),
  );
  wall.rotation.z = Math.PI / 2;
  S.scene.add(wall);
  const plasma = glowSprite('#ff5a6a', 9, 0.1, 1);
  S.scene.add(plasma);

  const r = rng(121);
  const NR = 520;
  const rbcs = createRBCs(S.L, NR, { deep: '#3a0309', mid: '#b3162c', rim: '#ff6470', seed: 9 });
  S.scene.add(rbcs);
  const rb = Array.from({ length: NR }, () => {
    const a = r() * TAU;
    const rr = Math.sqrt(r()) * (R - 0.22);
    return { x0: r() * LEN, y: Math.cos(a) * rr, z: Math.sin(a) * rr, sp: 1.2 * (1 - (rr / R) ** 2) + 0.25, axis: new THREE.Vector3(...r.dir()), spin: r.range(0.4, 1.4), ph: r() * TAU, s: r.range(0.16, 0.19) };
  });

  // catheter entering from upper left
  const cA = v3(-7.5, 5.2, 0.3);
  const cB = v3(-1.2, 0.35, 0.05);
  const catheter = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, cA.distanceTo(cB), 24, 1, true), glassMaterial({ tint: '#d8f0ff', edge: 1.2, face: 0.06, streak: 0.8 }));
  catheter.position.copy(cA).add(cB).multiplyScalar(0.5);
  catheter.quaternion.setFromUnitVectors(v3(0, 1, 0), cB.clone().sub(cA).normalize());
  S.scene.add(catheter);
  const tip = glowSprite('#7fe6ff', 1.4, 0.25, 1.4);
  tip.position.copy(cB);
  S.scene.add(tip);

  const NT = 60;
  const tcells = createCrowd(S.L, NT, { palette: 'tcell', detail: 14, disp: 0.07, villi: 0.02, speck: 1.2, seed: 17 });
  S.scene.add(tcells);
  const tc = Array.from({ length: NT }, (_, i) => ({ t0: 0.3 + i * 0.12 + r() * 0.06, y: r.range(-0.75, 0.75), z: r.range(-0.7, 0.7), sp: r.range(0.9, 1.3), axis: new THREE.Vector3(...r.dir()), ph: r() * TAU }));

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = v3(0, 0, 0);
  const scl = v3(1, 1, 1);
  const dir = cB.clone().sub(cA).normalize();
  const flow = (t) => t * 1.6;

  const cam = camPath(
    [
      { t: 0, p: [-2.4, 1.6, 8.2], l: [-1.4, 0.8, 0], fov: 33 },
      { t: 7.2, p: [3.2, 0.6, 7.0], l: [2.2, 0.1, 0], fov: 32 },
    ],
    { shake: 0.012 },
  );
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 6.5,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.85, radius: 0.6, threshold: 0.72 },
    labels: [
      { t0: 0.8, t1: 3.6, at: v3(-4.2, R * 0.95, 0.4), zh: '静脉', en: 'VEIN', dx: -90, dy: -110, hl: 110, color: '#ff8a8a' },
      { t0: 3.4, t1: 6.3, at: () => pos.clone(), zh: 'CAR-T 细胞进入血液循环', en: 'INTO THE BLOODSTREAM', dx: 110, dy: -130, hl: 270, color: '#7fe6ff' },
    ],
    update(t) {
      cam(S.camera, t);
      for (let i = 0; i < NR; i++) {
        const c = rb[i];
        let x = ((c.x0 + flow(t) * c.sp) % LEN) - LEN / 2;
        pos.set(x, c.y + 0.03 * Math.sin(t + c.ph), c.z);
        q.setFromAxisAngle(c.axis, c.ph + t * c.spin);
        scl.setScalar(c.s);
        m4.compose(pos, q, scl);
        rbcs.setMatrixAt(i, m4);
      }
      rbcs.instanceMatrix.needsUpdate = true;
      // CAR-T cells slide down the catheter, then join the flow
      let lead = null;
      for (let i = 0; i < NT; i++) {
        const c = tc[i];
        const u = (t - c.t0) * 1.9;
        let s = 0.2;
        if (u < 0) {
          scl.setScalar(1e-4);
          pos.copy(cA);
        } else {
          const along = cA.distanceTo(cB);
          if (u < along) {
            pos.copy(cA).addScaledVector(dir, u);
            s = 0.085;
          } else {
            const k = u - along;
            const spread = smoothstep(0, 1.6, k);
            pos.set(cB.x + k * c.sp * 0.85, cB.y + (c.y - cB.y) * spread, cB.z + c.z * spread);
            s = lerp(0.085, 0.22, smoothstep(0, 0.8, k));
          }
          scl.setScalar(s);
          if (!lead && u > along + 1.2) lead = pos.clone();
        }
        q.setFromAxisAngle(c.axis, c.ph + t * 0.8);
        m4.compose(pos, q, scl);
        tcells.setMatrixAt(i, m4);
      }
      if (lead) pos.copy(lead);
      else pos.copy(cB);
      tcells.instanceMatrix.needsUpdate = true;
      tcells.userData.u.uTime.value = t;
      tcells.userData.u.uGlowAll.value = 0.12;
      plasma.position.set(S.camera.position.x, 0, 0);
      tip.material.opacity = 0.2 + 0.15 * Math.sin(t * 3);
      S.tick(t);
    },
  };
}
