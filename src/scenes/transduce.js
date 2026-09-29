import * as THREE from 'three';
import { createCell } from '../gfx/cell.js';
import { blob, blobMaterial, tube } from '../gfx/blob.js';
import { glowSprite, glowTexture, color } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, lerp, rng, clamp, TAU, envelope } from '../engine/util.js';
import { stage, v3 } from './shared.js';

const VIRUS = { deep: '#1d1240', mid: '#7a62e0', rim: '#cbb9ff', glow: '#9d86ff', nucleus: '#e7b95a' };
const NUC = { deep: '#0a1438', mid: '#3d57b0', rim: '#94b4ff', glow: '#6a8cff', nucleus: '#000' };

// ---------------------------------------------------------------- A: entry
export function transduceA(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.35, 0.8, 0.5], key: '#fff1e2', keyIntensity: 1.15, fill: '#1a2742', fillIntensity: 0.7, back: '#b9a6ff', backIntensity: 0.9 },
    backdrop: { inner: '#141a3a', outer: '#02030a', accent: '#1c1846', accentAmt: 0.5, center: [0.62, 0.45] },
    dust: [{ count: 460, box: [18, 12, 18], tint: '#b8b0ff', tint2: '#9fe0ff', size: 0.03, focus: 4.2, aperture: 1.6, opacity: 0.55, seed: 31 }],
  });
  const RC = 1.15;
  const cell = S.add(
    createCell({ lights: S.L, palette: 'tcell', seed: 5, detail: 72, disp: 0.07, dispSpeed: 0.15, villi: 0.02, receptors: { kind: 'tcr', count: 190, length: 0.1 }, haloSize: 3, haloOpacity: 0.16 }),
  );
  cell.group.scale.setScalar(RC);
  cell.b.uGlow.value = 0.12;
  cell.u.uPitW.value = 0.3;
  cell.b.uHotColor.value = color('#b59cff');

  const r = rng(61);
  const RV = 0.17;
  const viruses = [];
  for (let i = 0; i < 6; i++) {
    const v = S.add(
      createCell({
        lights: S.L,
        palette: VIRUS,
        seed: 60 + i,
        detail: 28,
        disp: 0.035,
        villi: 0,
        receptors: { kind: 'spike', count: 64, length: 0.34, sway: 0.08 },
        nucleus: { offset: [0.05, 0, 0], radius: 0.5, vis: 0.6, color: '#e7b95a' },
        haloSize: 3.2,
        haloOpacity: 0.3,
        rimAmt: 0.9,
      }),
    );
    v.group.scale.setScalar(RV * (i === 0 ? 1 : r.range(0.85, 1.05)));
    v.b.uGlow.value = 0.15;
    v.rec.userData.u.uGlow.value = 0.15;
    viruses.push({
      v,
      base: i === 0 ? null : v3(r.range(1.6, 3.4), r.range(-0.4, 2.2), r.range(-1.6, 1.4)),
      ph: r() * TAU,
      spin: v3(r.range(-0.6, 0.6), r.range(-0.6, 0.6), r.range(-0.4, 0.4)),
    });
  }
  const dv = v3(0.62, 0.42, 0.66).normalize();
  const hero = viruses[0].v;
  const start = dv.clone().multiplyScalar(3.6).add(v3(0.6, 1.0, -1.2));
  const touch = dv.clone().multiplyScalar(RC * 1.02 + RV * 0.92);
  const inside = dv.clone().multiplyScalar(RC - RV * 2.6);

  const cam = camPath(
    [
      { t: 0, p: [-2.9, 1.25, 4.6], l: [0.55, 0.42, 0.62], fov: 31 },
      { t: 7.6, p: [-1.55, 0.95, 3.05], l: [0.62, 0.45, 0.66], fov: 27 },
    ],
    { shake: 0.012 },
  );
  const tmp = v3(0, 0, 0);
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 7,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.85, radius: 0.6, threshold: 0.72 },
    labels: [{ t0: 0.7, t1: 3.6, at: () => hero.group.position.clone().add(v3(0.1, 0.16, 0)), zh: '慢病毒载体', en: 'LENTIVIRAL VECTOR', dx: 120, dy: -96, hl: 200, color: '#b59cff' }],
    update(t) {
      cam(S.camera, t);
      cell.group.rotation.set(0, 0, 0);
      // hero: drift in, bind, get engulfed
      const k1 = prog(t, 0, 2.6, ease.outCubic);
      const wob = (1 - k1) * 0.18;
      const p = start.clone().lerp(touch, k1).add(v3(Math.sin(t * 1.7) * wob, Math.cos(t * 1.3) * wob, Math.sin(t * 1.1 + 1) * wob));
      const k2 = prog(t, 3.1, 5.6, ease.inOutSine);
      p.lerp(inside, k2);
      hero.group.position.copy(p);
      hero.group.rotation.set(t * 0.3, t * 0.5, 0);
      const closing = smoothstep(5.2, 6.4, t);
      hero.opacity = 1 - smoothstep(5.4, 6.0, t);
      // pit follows the particle, then seals over it
      const depthWorld = Math.max(0, RC * 1.02 + RV * 0.9 - p.length());
      cell.u.uPit.value.set(dv.x, dv.y, dv.z, (depthWorld / RC) * (1 - closing));
      cell.u.uPitW.value = 0.17 + 0.08 * k2;
      cell.b.uHot.value.set(dv.x, dv.y, dv.z, 0.28 * envelope(t, 2.6, 6.8, 0.5, 1.2));
      // bystanders drift
      for (let i = 1; i < viruses.length; i++) {
        const { v, base, ph, spin } = viruses[i];
        tmp.set(Math.sin(t * 0.35 + ph) * 0.25, Math.cos(t * 0.28 + ph) * 0.2, Math.sin(t * 0.22 + ph * 2) * 0.25);
        v.group.position.copy(base).add(tmp);
        v.group.rotation.set(t * spin.x, t * spin.y, t * spin.z);
      }
      S.tick(t);
    },
  };
}

// ---------------------------------------------------------------- B: reverse transcription
function coneCapsid(lights) {
  const pts = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const y = lerp(-0.34, 0.34, u);
    const rad = lerp(0.07, 0.19, u) * Math.sin(Math.min(1, u * 1.6 + 0.12) * Math.PI * 0.5 + 0.0001) * (u > 0.92 ? Math.sqrt(1 - (u - 0.92) / 0.08) : 1);
    pts.push(new THREE.Vector2(Math.max(0.0005, rad), y));
  }
  const g = new THREE.LatheGeometry(pts, 24);
  g.computeVertexNormals();
  return new THREE.Mesh(g, blobMaterial(lights, { deep: '#2a1650', mid: '#9277f0', rim: '#e0d4ff', glow: '#b8a2ff', glowAmt: 0.25, spec: 0.7 }));
}

// Two strands wound around a path; the second grows as the RNA is copied.
function duplex(lights, path, { turns = 7, radius = 0.06, strand = 0.022 } = {}) {
  const curve = new THREE.CatmullRomCurve3(path);
  const N = 240;
  const frames = curve.computeFrenetFrames(N, false);
  const a = [];
  const b = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const c = curve.getPointAt(u);
    const ang = u * turns * TAU;
    const nrm = frames.normals[i];
    const bin = frames.binormals[i];
    a.push(c.clone().addScaledVector(nrm, Math.cos(ang) * radius).addScaledVector(bin, Math.sin(ang) * radius));
    b.push(c.clone().addScaledVector(nrm, Math.cos(ang + Math.PI) * radius).addScaledVector(bin, Math.sin(ang + Math.PI) * radius));
  }
  const mk = (pts, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 600, strand, 6, false), mat);
  const A = mk(a, blobMaterial(lights, { deep: '#4a2c00', mid: '#f0b440', rim: '#ffe6a0', glow: '#ffc24a', glowAmt: 0.55 }));
  const B = mk(b, blobMaterial(lights, { deep: '#4a3a10', mid: '#ffe08a', rim: '#fff4d0', glow: '#ffe7a0', glowAmt: 0.5 }));
  const g = new THREE.Group();
  g.add(A, B);
  return { group: g, A, B, curve };
}

export function transduceB(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [0.2, 0.9, 0.5], key: '#e8f6ff', keyIntensity: 1.1, fill: '#0e2c38', fillIntensity: 0.8, back: '#7fe6ff' },
    backdrop: { inner: '#07303c', outer: '#010507', accent: '#0b4656', accentAmt: 0.6, center: [0.5, 0.5] },
    dust: [
      { count: 900, box: [16, 10, 14], tint: '#9ff0ff', tint2: '#ffe2a0', size: 0.022, focus: 4.4, aperture: 1.4, opacity: 0.6, seed: 41, speed: 0.02 },
    ],
  });
  const nuc = S.add(
    createCell({ lights: S.L, palette: NUC, seed: 80, detail: 72, disp: 0.03, dispFreq: 1.1, villi: 0.0, receptors: { kind: 'pore', count: 140, length: 0.1, sway: 0 }, haloSize: 2.7, haloOpacity: 0.16, texScale: 1.6 }),
  );
  nuc.group.position.set(-1.7, -0.35, -0.6);
  nuc.group.scale.setScalar(1.95);
  nuc.rec.userData.u.uGlow.value = 0.35;

  // Organelles, out of focus.
  const r = rng(71);
  for (let i = 0; i < 7; i++) {
    const m = blob(S.L, 90 + i, { detail: 3, amp: 0.1, scale: [1, 0.42, 0.42] }, { deep: '#1a0c06', mid: '#5a3420', rim: '#c07a4a', soft: 1.0, transparent: true, opacity: 0.5 });
    m.position.set(r.range(0, 7), r.range(-2.5, 3.2), r.range(-7.5, -3.8));
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.scale.setScalar(r.range(0.4, 0.8));
    S.scene.add(m);
  }

  // Microtubule track.
  const trackPts = [v3(5.2, 1.7, 1.2), v3(3.4, 1.2, 0.7), v3(1.8, 0.55, 0.3), v3(0.6, 0.05, -0.05), v3(0.05, -0.12, -0.2)];
  const track = tube(S.L, trackPts, { radius: 0.03, segments: 120, radial: 8, deep: '#0a3040', mid: '#6fd8f0', rim: '#c8f6ff', glow: '#7fe6ff', glowAmt: 0.35 });
  S.scene.add(track);
  const trackCurve = track.userData.curve;

  const capsid = coneCapsid(S.L);
  capsid.scale.setScalar(0.9);
  S.scene.add(capsid);
  const capGlow = glowSprite('#b8a2ff', 1.4, 0.3, 1);
  S.scene.add(capGlow);

  const dnaPath = [v3(0.75, 0.55, 0.45), v3(0.45, 0.2, 0.5), v3(0.62, -0.25, 0.42), v3(0.3, -0.55, 0.3), v3(0.12, -0.85, 0.1)];
  const dsd = duplex(S.L, dnaPath, { turns: 6, radius: 0.055, strand: 0.02 });
  S.scene.add(dsd.group);
  const rt = glowSprite('#fff2c0', 0.5, 0.9, 2.0);
  S.scene.add(rt);
  const idxA = dsd.A.geometry.index.count;
  const idxB = dsd.B.geometry.index.count;
  const pore = v3(0.26, -1.0, -0.1);

  const cam = camPath(
    [
      { t: 0, p: [3.4, 1.15, 5.3], l: [0.4, 0.05, 0.0], fov: 32 },
      { t: 6.8, p: [2.35, 0.35, 3.7], l: [0.35, -0.3, 0.05], fov: 30 },
    ],
    { shake: 0.012 },
  );
  const tng = v3(0, 0, 0);
  const upY = v3(0, 1, 0);
  const q = new THREE.Quaternion();
  return {
    scene: S.scene,
    camera: S.camera,
    duration: 6,
    transition: { type: 'cross', dur: 1.0 },
    bloom: { strength: 0.9, radius: 0.6, threshold: 0.7 },
    labels: [
      { t0: 0.5, t1: 3.0, at: () => nuc.group.position.clone().add(v3(-0.6, 1.9, 0.9)), zh: '细胞核', en: 'NUCLEUS', dx: -110, dy: -80, hl: 130, color: '#94b4ff' },
      { t0: 2.7, t1: 5.7, at: () => dsd.curve.getPointAt(0.45).clone(), zh: '逆转录：RNA → DNA', en: 'REVERSE TRANSCRIPTION', dx: 150, dy: 70, hl: 260, color: '#ffd27a' },
    ],
    update(t) {
      cam(S.camera, t);
      // capsid rides the microtubule, then uncoats
      const u = prog(t, -0.6, 2.3, ease.outSine);
      const pos = trackCurve.getPointAt(clamp(u));
      trackCurve.getTangentAt(clamp(u), tng);
      capsid.position.copy(pos).add(v3(0, 0.08, 0.05));
      q.setFromUnitVectors(upY, tng.clone().negate());
      capsid.quaternion.copy(q);
      const unc = smoothstep(2.1, 2.9, t);
      capsid.scale.setScalar(0.9 * (1 - 0.6 * unc));
      capsid.visible = unc < 0.99;
      capsid.material.userData.u.uOpacity.value = 1 - unc;
      capsid.material.transparent = true;
      capGlow.position.copy(capsid.position);
      capGlow.material.opacity = 0.35 * (1 - unc) + 0.6 * envelope(t, 2.0, 3.2, 0.3, 0.6);

      // RNA strand appears, complementary strand is written, complex heads to a pore
      const show = smoothstep(2.1, 2.6, t);
      dsd.A.geometry.setDrawRange(0, Math.floor(idxA * clamp(prog(t, 2.1, 2.9, ease.outCubic)) / 3) * 3);
      const w = prog(t, 2.8, 4.6, ease.inOutSine);
      dsd.B.geometry.setDrawRange(0, Math.floor((idxB * w) / 3) * 3);
      dsd.A.material.userData.u.uOpacity.value = show;
      const go = prog(t, 4.4, 6.4, ease.inOutCubic);
      dsd.group.position.copy(pore).sub(v3(0.45, -0.1, 0.35)).multiplyScalar(go);
      dsd.group.scale.setScalar(1 - 0.35 * go);
      const front = dsd.curve.getPointAt(clamp(w));
      rt.position.copy(front).multiplyScalar(dsd.group.scale.x).add(dsd.group.position);
      rt.material.opacity = 0.85 * envelope(t, 2.8, 4.8, 0.3, 0.4);
      nuc.group.rotation.set(0.1, t * 0.04, 0);
      nuc.group.updateMatrixWorld(true);
      const end = dsd.curve.getPointAt(1).clone().multiplyScalar(dsd.group.scale.x).add(dsd.group.position);
      const hl = nuc.group.worldToLocal(end).normalize();
      nuc.b.uHot.value.set(hl.x, hl.y, hl.z, 0.45 * envelope(t, 4.8, 6.6, 0.6, 0.4));
      nuc.b.uHotColor.value.set(1.0, 0.8, 0.4);
      S.tick(t);
    },
  };
}

// ---------------------------------------------------------------- C: integration
export function transduceC(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.4, 0.85, 0.6], key: '#eef4ff', keyIntensity: 1.15, fill: '#141d44', fillIntensity: 0.75, back: '#a0b8ff' },
    backdrop: { inner: '#10183e', outer: '#02030a', accent: '#1e2a66', accentAmt: 0.55, center: [0.5, 0.5] },
    dust: [{ count: 600, box: [18, 10, 14], tint: '#a8baff', tint2: '#ffd98a', size: 0.022, focus: 5.5, aperture: 1.3, opacity: 0.5, seed: 51 }],
  });
  const RISE = 0.34;
  const TURN = 10.5;
  const RAD = 0.44;
  const SUB = 4; // pearls per base pair along each backbone
  const NL = 30;
  const NR = 30;
  const NI = 14;
  const total = NL + NI + NR;
  const beadGeo = new THREE.IcosahedronGeometry(0.075, 2);
  const rungGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 6, 1);
  const beadMat = blobMaterial(S.L, { deep: '#1a2448', mid: '#b8c8f0', rim: '#eef3ff', spec: 0.7, gloss: 48 });
  const rungMat = blobMaterial(S.L, { deep: '#141c3a', mid: '#8fa2d8', rim: '#d0dcff', spec: 0.3 });
  const beads = new THREE.InstancedMesh(beadGeo, beadMat, total * SUB * 2);
  const rungs = new THREE.InstancedMesh(rungGeo, rungMat, total);
  beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rungs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beads.frustumCulled = false;
  rungs.frustumCulled = false;
  const cHost = [color('#dfe7ff'), color('#a9bcf0')];
  const cBase = [color('#6f86c8'), color('#8a7fd0'), color('#5aa0c8'), color('#7d93b8')];
  const cGold = color('#ffbf45', 1.2);
  const cGold2 = color('#ffe39a', 1.15);
  const cGoldR = [color('#f0a030', 1.1), color('#ffd070', 1.1)];
  const r = rng(52);
  const isIns = (i) => i >= NL && i < NL + NI;
  for (let i = 0; i < total; i++) {
    for (let j = 0; j < SUB; j++) {
      const k = (i * SUB + j) * 2;
      beads.setColorAt(k, isIns(i) ? cGold : cHost[0]);
      beads.setColorAt(k + 1, isIns(i) ? cGold2 : cHost[1]);
    }
    rungs.setColorAt(i, isIns(i) ? cGoldR[i % 2] : cBase[r.int(0, 3)]);
  }
  const group = new THREE.Group();
  group.add(beads, rungs);
  group.rotation.set(0, -0.5, 0.12);
  S.scene.add(group);

  const integ = [0, 1].map((i) => {
    const m = blob(S.L, 120 + i, { detail: 3, amp: 0.12 }, { deep: '#241046', mid: '#8b6cf0', rim: '#e0d4ff', glow: '#a78bff', glowAmt: 0.5, transparent: true, opacity: 0.85 });
    group.add(m);
    return m;
  });
  const flashes = [0, 1].map(() => {
    const g = glowSprite('#ffd98a', 1.1, 0, 1.8);
    group.add(g);
    return g;
  });

  const sparkN = 70;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(sparkN * 3), 3));
  const sparkMat = new THREE.PointsMaterial({ color: color('#ffd27a', 2.0), size: 0.13, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture(), sizeAttenuation: true });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(sparks);
  const sparkSeed = Array.from({ length: sparkN }, () => [r.range(-0.5, 0.5) * NI * RISE, r(), r.range(0.4, 1.0), r() * TAU]);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const yAxis = v3(0, 1, 0);
  const off = (NL + NI / 2) * RISE;
  const insCenter = v3(0, 0, 0);
  const world = v3(0, 0, 0);

  // Position of backbone point f (base-pair units) at time t.
  function pose(f, t) {
    const i = Math.floor(f);
    const spin = t * 0.22;
    const open = prog(t, 1.2, 3.1, ease.inOutCubic);
    let y = 0;
    let z = 0;
    let idx = f;
    if (isIns(i)) {
      const drop = 1 - prog(t, 0.6, 3.5, ease.inOutCubic);
      y = drop * 2.4;
      z = drop * 0.9;
    } else if (i >= NL + NI) idx = f - NI * (1 - open);
    const s = idx * RISE - off;
    const ph = (idx / TURN) * TAU + spin;
    return { s, ph, y, z };
  }
  const strandPoint = (f, t, which, out) => {
    const { s, ph, y, z } = pose(f, t);
    const a = ph + (which ? 2.35 : 0);
    return out.set(s, y + Math.cos(a) * RAD, z + Math.sin(a) * RAD);
  };

  const cam = camPath(
    [
      { t: 0, p: [2.6, 1.5, 6.6], l: [0.2, 0.5, 0], fov: 31 },
      { t: 7.4, p: [1.1, 0.7, 5.0], l: [0.0, 0.2, 0], fov: 29 },
    ],
    { shake: 0.012 },
  );

  return {
    scene: S.scene,
    camera: S.camera,
    duration: 7,
    transition: { type: 'cross', dur: 1.0 },
    bloom: { strength: 0.85, radius: 0.6, threshold: 0.74 },
    labels: [
      { t0: 0.8, t1: 3.3, at: () => group.localToWorld(world.copy(insCenter).add(v3(0, 0.5, 0))), zh: 'CAR 基因', en: 'CAR TRANSGENE', dx: 130, dy: -90, hl: 180, color: '#ffd27a' },
      { t0: 3.8, t1: 6.8, at: () => group.localToWorld(world.set(-(NI / 2) * RISE + 0.2, -0.45, 0.2)), zh: '整合进 T 细胞基因组', en: 'GENOMIC INTEGRATION', dx: -120, dy: 110, hl: 250, color: '#ffd27a' },
    ],
    update(t) {
      cam(S.camera, t);
      group.updateMatrixWorld(true);
      for (let i = 0; i < total; i++) {
        for (let j = 0; j < SUB; j++) {
          const f = i + j / SUB;
          const k = (i * SUB + j) * 2;
          q.identity();
          sc.set(1, 1, 1);
          m4.compose(strandPoint(f, t, 0, A), q, sc);
          beads.setMatrixAt(k, m4);
          m4.compose(strandPoint(f, t, 1, B), q, sc);
          beads.setMatrixAt(k + 1, m4);
        }
        strandPoint(i + 0.5, t, 0, A);
        strandPoint(i + 0.5, t, 1, B);
        mid.copy(A).add(B).multiplyScalar(0.5);
        const len = A.distanceTo(B);
        q.setFromUnitVectors(yAxis, B.clone().sub(A).normalize());
        sc.set(1, len * 0.86, 1);
        m4.compose(mid, q, sc);
        rungs.setMatrixAt(i, m4);
      }
      const c = pose(NL + NI / 2, t);
      insCenter.set(c.s, c.y, c.z);
      beads.instanceMatrix.needsUpdate = true;
      rungs.instanceMatrix.needsUpdate = true;

      const lEnd = pose(NL, t);
      const rEnd = pose(NL + NI, t);
      integ[0].position.set(lEnd.s - 0.1, lEnd.y + 0.62, lEnd.z + 0.3);
      integ[1].position.set(rEnd.s + 0.1, rEnd.y + 0.62, rEnd.z + 0.3);
      const ig = 1 - smoothstep(3.5, 4.5, t);
      integ.forEach((m, k) => {
        m.scale.setScalar(0.24 * (0.25 + 0.75 * ig) * smoothstep(0.2, 0.8, t));
        m.rotation.set(t * 0.6 + k, t * 0.4, 0);
        m.visible = ig > 0.02;
      });
      const fl = envelope(t, 3.2, 4.8, 0.25, 1.1);
      flashes[0].position.set(pose(NL, t).s, 0, 0.3);
      flashes[1].position.set(pose(NL + NI, t).s, 0, 0.3);
      flashes.forEach((f) => (f.material.opacity = 0.55 * fl));

      const p = sparks.geometry.attributes.position;
      for (let i = 0; i < sparkN; i++) {
        const [x0, ph, sp, a] = sparkSeed[i];
        const life = (((t * 0.33 * sp + ph) % 1) + 1) % 1;
        p.setXYZ(i, insCenter.x + x0 + Math.sin(a + t) * 0.15, life * 2.4 + 0.45, Math.cos(a + t * 0.7) * 0.35);
      }
      p.needsUpdate = true;
      sparkMat.opacity = smoothstep(4.6, 5.4, t) * 0.9;
      const glow = envelope(t, 4.4, 7.6, 0.8, 0.5) * (0.6 + 0.4 * Math.sin(t * 5));
      beadMat.userData.u.uGlowC.value.set(1.0, 0.72, 0.25);
      beadMat.userData.u.uGlow.value = 0.1 * glow;
      S.tick(t);
    },
  };
}
