import * as THREE from 'three';
import { createRBCs } from '../gfx/rbc.js';
import { createCrowd } from '../gfx/crowd.js';
import { glassMaterial } from '../gfx/blob.js';
import { glowSprite, color } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { rng, smootherstep, smoothstep, rampAngle, lerp, TAU } from '../engine/util.js';
import { stage, v3 } from './shared.js';

// Leukapheresis: blood spins in a separation channel and settles into layers
// by density — red cells outermost, the white "buffy coat" (with T cells) in a
// thin middle band, plasma and platelets inside.
export function collect(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.3, 0.9, 0.35], key: '#fff0e6', keyIntensity: 1.25, fill: '#1a2436', fillIntensity: 0.7, back: '#ffb0b0', backIntensity: 0.6 },
    backdrop: { inner: '#101a2a', outer: '#010207', accent: '#2a1420', accentAmt: 0.35, center: [0.5, 0.55] },
    dust: [{ count: 380, box: [26, 12, 26], tint: '#9fd0ff', size: 0.03, focus: 7, aperture: 1.0, opacity: 0.45, seed: 11 }],
  });
  const R = 3.2;
  const TUBE = 0.46;
  const r = rng(101);

  // Glass channel and an engraved scale ring beneath it.
  const glass = new THREE.Mesh(new THREE.TorusGeometry(R, TUBE + 0.04, 28, 220), glassMaterial({ tint: '#bfe4ff', edge: 0.7, face: 0.012, streak: 0.5 }));
  glass.rotation.x = Math.PI / 2;
  S.scene.add(glass);
  const ticks = [];
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU;
    const long = i % 15 === 0 ? 0.32 : i % 5 === 0 ? 0.18 : 0.1;
    const r0 = R + TUBE + 0.28;
    ticks.push(Math.cos(a) * r0, -0.55, Math.sin(a) * r0, Math.cos(a) * (r0 + long), -0.55, Math.sin(a) * (r0 + long));
  }
  const circle = (rad, y, n = 256) => {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      p.push(Math.cos(a0) * rad, y, Math.sin(a0) * rad, Math.cos(a1) * rad, y, Math.sin(a1) * rad);
    }
    return p;
  };
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([...ticks, ...circle(R + TUBE + 0.28, -0.55), ...circle(R - TUBE - 0.3, -0.55), ...circle(R - TUBE - 0.36, -0.55)], 3));
  const lineMat = new THREE.LineBasicMaterial({ color: color('#e8c47f', 0.55), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  const scale = new THREE.LineSegments(lineGeo, lineMat);
  S.scene.add(scale);

  // Populations. Radii are band targets after separation.
  const N_RBC = 1100;
  const N_T = 46;
  const N_W = 34;
  const N_P = 220;
  const rbcs = createRBCs(S.L, N_RBC, { deep: '#3a0309', mid: '#b3162c', rim: '#ff6470', seed: 3 });
  const plates = createRBCs(S.L, N_P, { deep: '#3a2a10', mid: '#e0c070', rim: '#fff0b8', seed: 5 });
  const tcells = createCrowd(S.L, N_T, { palette: 'tcell', detail: 12, disp: 0.08, villi: 0.03, seed: 7 });
  const wbcs = createCrowd(S.L, N_W, { palette: 'wbc', detail: 12, disp: 0.08, villi: 0.03, seed: 9 });
  S.scene.add(rbcs, plates, tcells, wbcs);

  const make = (n, band, spread, size) =>
    Array.from({ length: n }, () => {
      const rr = Math.sqrt(r()) * (TUBE - size * 1.2);
      const ang = r() * TAU;
      return {
        th: r() * TAU,
        r0: R + Math.cos(ang) * rr,
        y0: Math.sin(ang) * rr * 0.85,
        rb: band + (r() - 0.5) * spread,
        yb: (r() - 0.5) * 0.62,
        delay: r() * 1.8,
        axis: new THREE.Vector3(...r.dir()),
        spin: r.range(0.3, 1.2) * r.sign(),
        phase: r() * TAU,
        size: size * r.range(0.85, 1.15),
        drift: r.range(-0.02, 0.02),
      };
    });
  const pR = make(N_RBC, R + 0.3, 0.24, 0.085);
  const pT = make(N_T, R - 0.02, 0.07, 0.1);
  const pW = make(N_W, R - 0.02, 0.07, 0.1);
  const pP = make(N_P, R - 0.3, 0.2, 0.028);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const flat = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2);

  const place = (mesh, list, t, ang, sep, disc) => {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const k = smootherstep(0, 1, (sep - c.delay * 0.12) / 0.88);
      const rad = lerp(c.r0, c.rb, k);
      const y = lerp(c.y0, c.yb, k) + 0.02 * Math.sin(t * 0.9 + c.phase);
      const th = c.th + ang * (1 + c.drift * (1 - k));
      pos.set(Math.cos(th) * rad, y, Math.sin(th) * rad);
      q.setFromAxisAngle(c.axis, c.phase + t * c.spin * (1 - 0.7 * k));
      if (disc) q.multiply(flat);
      q2.setFromAxisAngle(v3(0, 1, 0), -th);
      q.premultiply(q2);
      scl.set(c.size, c.size, c.size);
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const bandGlow = glowSprite('#58d6ff', 4, 0, 1);
  bandGlow.position.set(0, 0, R);
  S.scene.add(bandGlow);

  const cam = camPath(
    [
      { t: 0, p: [1.6, 0.75, 5.4], l: [0.2, -0.05, 3.1], fov: 30 },
      { t: 4.8, p: [0.4, 5.6, 7.4], l: [0.3, -0.3, 0.5], fov: 34 },
      { t: 8.4, p: [1.0, 7.0, 5.4], l: [0.7, -0.4, 0.2], fov: 34 },
      { t: 10.3, p: [1.1, 6.7, 5.1], l: [0.8, -0.4, 0.3], fov: 34 },
      { t: 14.4, p: [0.7, 1.25, 1.1], l: [1.9, -0.2, 2.65], fov: 32 },
    ],
    { mode: 'seg', shake: 0.015 },
  );

  const bandPoint = (rad, a) => v3(Math.cos(a) * rad, 0, Math.sin(a) * rad);
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 13,
    transition: { type: 'cross', dur: 1.4 },
    bloom: { strength: 0.75, radius: 0.55, threshold: 0.75 },
    labels: [
      { t0: 8.3, t1: 11.2, at: bandPoint(R + 0.36, -0.22), zh: '红细胞', en: 'RED BLOOD CELLS', dx: 110, dy: -96, hl: 150, color: '#ff6470' },
      { t0: 8.7, t1: 11.3, at: bandPoint(R - 0.02, 0.06), zh: '白细胞层（含 T 细胞）', en: 'BUFFY COAT', dx: 150, dy: 34, hl: 250, color: '#7fe6ff' },
      { t0: 9.1, t1: 11.4, at: bandPoint(R - 0.34, 0.32), zh: '血浆与血小板', en: 'PLASMA · PLATELETS', dx: -130, dy: 104, hl: 190, color: '#f0d890' },
    ],
    update(t) {
      cam(S.camera, t);
      const ang = rampAngle(t, 0.12, 0.85, 1.2, 6.5);
      const sep = smoothstep(3.2, 9.4, t);
      place(rbcs, pR, t, ang, sep, true);
      place(plates, pP, t, ang, sep, true);
      place(tcells, pT, t, ang, sep, false);
      place(wbcs, pW, t, ang, sep, false);
      const hi = smoothstep(8.2, 10.2, t);
      tcells.userData.u.uGlowAll.value = 0.05 + 0.55 * hi;
      rbcs.userData.u.uDim.value = 1 - 0.35 * hi;
      bandGlow.material.opacity = 0.25 * hi;
      glass.material.userData.u.uOpacity.value = 0.85;
      lineMat.opacity = 0.35 + 0.15 * smoothstep(3, 6, t);
      rbcs.userData.u.uOpacity.value = 1;
      tcells.userData.u.uTime.value = t;
      wbcs.userData.u.uTime.value = t;
      S.tick(t);
    },
  };
}
