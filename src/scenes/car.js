import * as THREE from 'three';
import { createMembrane } from '../gfx/membrane.js';
import { blob, tube } from '../gfx/blob.js';
import { glowSprite } from '../gfx/common.js';
import { camPath } from '../engine/camera.js';
import { prog, ease, smoothstep, envelope, rng, TAU, clamp } from '../engine/util.js';
import { stage, v3 } from './shared.js';

// Gold = antibody-derived recognition; cyan = T-cell signalling. The colour
// split is the point: a chimera of two molecules.
const GOLD_A = { deep: '#4a2c04', mid: '#f0b040', rim: '#ffe6a0' };
const GOLD_B = { deep: '#4a2604', mid: '#e89a2a', rim: '#ffd890' };
const CHAMP = { deep: '#3a2e18', mid: '#d8c090', rim: '#fff0cc' };
const COPPER = { deep: '#3a1c08', mid: '#c8823c', rim: '#ffc890' };
const TEAL = { deep: '#063a38', mid: '#2fbab0', rim: '#a8fff4' };
const CYAN = { deep: '#082a44', mid: '#3aa6dc', rim: '#bff4ff' };

export function buildCAR(L) {
  const g = new THREE.Group();
  const parts = {};
  // scFv: VH + VL with a flexible linker
  const scfv = new THREE.Group();
  const vh = blob(L, 201, { detail: 4, amp: 0.09, scale: [0.3, 0.44, 0.3] }, { ...GOLD_A, spec: 0.5 });
  vh.position.set(-0.19, 2.08, 0);
  vh.rotation.set(0.1, 0.3, 0.18);
  const vl = blob(L, 202, { detail: 4, amp: 0.09, scale: [0.28, 0.42, 0.29] }, { ...GOLD_B, spec: 0.5 });
  vl.position.set(0.2, 2.0, 0.06);
  vl.rotation.set(-0.1, -0.2, -0.16);
  const linker = tube(L, [v3(-0.16, 1.66, 0.12), v3(-0.02, 1.5, 0.3), v3(0.12, 1.53, 0.26), v3(0.2, 1.62, 0.12)], { radius: 0.026, segments: 40, radial: 6, ...GOLD_A });
  scfv.add(vh, vl, linker);
  g.add(scfv);
  parts.scfv = scfv;
  // hinge
  const hinge = tube(L, [v3(0.02, 1.62, 0), v3(0.1, 1.33, 0.05), v3(-0.05, 1.0, -0.02), v3(0.04, 0.68, 0.02), v3(0, 0.46, 0)], { radius: 0.055, segments: 60, radial: 10, ...CHAMP });
  g.add(hinge);
  parts.hinge = hinge;
  // transmembrane alpha helix
  const hp = [];
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    const a = u * 3.2 * TAU;
    hp.push(v3(Math.cos(a) * 0.075, 0.47 - u * 0.95, Math.sin(a) * 0.075));
  }
  const tm = tube(L, hp, { radius: 0.042, segments: 160, radial: 8, ...COPPER, glow: '#ffb070', glowAmt: 0.15 });
  g.add(tm);
  parts.tm = tm;
  // 4-1BB co-stimulatory domain
  const costim = new THREE.Group();
  const cs = blob(L, 203, { detail: 4, amp: 0.1, scale: [0.3, 0.33, 0.28] }, { ...TEAL, spec: 0.45 });
  cs.position.set(0.05, -0.92, 0.02);
  const csLink = tube(L, [v3(0, -0.47, 0), v3(0.04, -0.6, 0.02), v3(0.05, -0.66, 0.02)], { radius: 0.04, segments: 12, radial: 6, ...TEAL });
  costim.add(cs, csLink);
  g.add(costim);
  parts.costim = costim;
  // CD3 zeta with three ITAMs
  const zeta = new THREE.Group();
  const zPath = [v3(0.08, -1.2, 0.02), v3(0.18, -1.55, 0.08), v3(0.02, -1.9, 0.12), v3(0.14, -2.25, 0.02), v3(0.02, -2.6, -0.05), v3(0.1, -2.85, 0.02)];
  const zt = tube(L, zPath, { radius: 0.05, segments: 90, radial: 8, ...CYAN });
  zeta.add(zt);
  const itams = [0.22, 0.55, 0.86].map((u) => {
    const m = blob(L, 210 + Math.round(u * 10), { detail: 3, amp: 0.06 }, { deep: '#0a3a55', mid: '#7fdcff', rim: '#e8fbff', glow: '#9fe8ff', glowAmt: 0.4 });
    m.scale.setScalar(0.1);
    m.position.copy(zt.userData.curve.getPointAt(u));
    zeta.add(m);
    return m;
  });
  g.add(zeta);
  parts.zeta = zeta;
  parts.zetaTube = zt;
  parts.itams = itams;
  return { g, parts };
}

export function car(ctx) {
  const S = stage(ctx, {
    lights: { keyDir: [-0.45, 0.8, 0.5], key: '#fff4ea', keyIntensity: 1.2, fill: '#15283e', fillIntensity: 0.8, back: '#9fe8ff' },
    backdrop: { inner: '#0b1c30', outer: '#010206', accent: '#10304a', accentAmt: 0.5, center: [0.5, 0.45] },
    dust: [{ count: 420, box: [20, 10, 20], tint: '#a8dcff', tint2: '#ffe0a8', size: 0.025, focus: 8, aperture: 1.2, opacity: 0.45, seed: 61 }],
  });
  const mem = createMembrane(S.L, { radius: 6.5, spacing: 0.15, curv: 0.008, amp: 0.03, waveF: 0.7, head: '#4f8aa2', innerHead: '#3f6f86', headRim: '#b8ecff', tail: '#28495a', fogNear: 4.5, fogFar: 13, fogColor: '#040a14' });
  S.scene.add(mem);
  mem.userData.u.uClear0.value.set(0, 0, 0.16, 1);

  const K = 0.62;
  const { g: carG, parts } = buildCAR(S.L);
  carG.scale.setScalar(K);
  S.scene.add(carG);

  // A field of finished CARs for the pull-back.
  const field = [];
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const c = buildCAR(S.L).g;
    const a = r() * TAU;
    const d = 1.6 + r() * 4.2;
    c.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    c.rotation.y = r() * TAU;
    c.scale.setScalar(K * r.range(0.9, 1.05));
    c.visible = false;
    S.scene.add(c);
    field.push({ c, d, delay: r() * 0.8 });
  }

  const pulse = glowSprite('#bff4ff', 0.38, 0, 2.0);
  S.scene.add(pulse);
  const hotTM = glowSprite('#ffc890', 0.9, 0, 1.2);
  S.scene.add(hotTM);

  const cam = camPath(
    [
      { t: 0, p: [3.4, 1.1, 8.0], l: [0.0, 0.2, 0], fov: 31 },
      { t: 6.5, p: [2.1, 0.5, 8.9], l: [0.0, -0.3, 0], fov: 32 },
      { t: 11.6, p: [-1.5, 0.45, 9.1], l: [0.1, -0.32, 0], fov: 32 },
      { t: 16, p: [-2.4, 5.4, 10.4], l: [0.1, -0.6, 0], fov: 34 },
    ],
    { shake: 0.01 },
  );

  const wp = (obj, local) => {
    obj.updateMatrixWorld(true);
    return obj.localToWorld(local.clone());
  };
  const appear = (grp, t0, dy) => {
    const k = prog(0, 0, 1);
    void k;
    return (t) => {
      const a = prog(t, t0, t0 + 1.3, ease.outCubic);
      grp.position.y = (1 - a) * dy;
      grp.visible = a > 0.001;
      grp.traverse((o) => {
        if (o.material && o.material.userData.u) {
          o.material.transparent = a < 1;
          o.material.userData.u.uOpacity.value = a;
        }
      });
    };
  };
  const drawIn = (mesh, t0, dur, fromEnd = false) => (t) => {
    const a = prog(t, t0, t0 + dur, ease.inOutSine);
    const n = mesh.geometry.index.count;
    const c = Math.floor((n * a) / 3) * 3;
    if (fromEnd) mesh.geometry.setDrawRange(n - c, c);
    else mesh.geometry.setDrawRange(0, c);
    mesh.visible = a > 0.001;
  };
  const anims = [
    appear(parts.scfv, 1.0, 1.4),
    drawIn(parts.hinge, 2.5, 1.2),
    drawIn(parts.tm, 3.9, 1.1),
    appear(parts.costim, 5.3, -1.1),
    appear(parts.zeta, 6.6, -1.3),
  ];

  return {
    scene: S.scene,
    camera: S.camera,
    duration: 15,
    transition: { type: 'cross', dur: 1.2 },
    bloom: { strength: 0.8, radius: 0.55, threshold: 0.75 },
    labels: [
      { t0: 1.6, t1: 11.6, at: () => wp(carG, v3(0.35, 2.2, 0.1)), zh: '单链抗体片段（scFv）', en: 'ANTIGEN BINDING', dx: 150, dy: 36, hl: 250, color: '#ffd27a' },
      { t0: 3.0, t1: 11.6, at: () => wp(carG, v3(0.08, 1.05, 0)), zh: '铰链区', en: 'HINGE', dx: 190, dy: 10, hl: 150, color: '#e8d8b0' },
      { t0: 4.4, t1: 11.6, at: () => wp(carG, v3(-0.08, 0.0, 0)), zh: '跨膜区', en: 'TRANSMEMBRANE', dx: -200, dy: -30, hl: 170, color: '#ffc890' },
      { t0: 5.8, t1: 11.6, at: () => wp(carG, v3(0.32, -0.92, 0)), zh: '共刺激域 4-1BB / CD28', en: 'CO-STIMULATION', dx: 160, dy: 20, hl: 290, color: '#7fffe8' },
      { t0: 7.1, t1: 11.6, at: () => wp(carG, v3(-0.1, -2.1, 0.1)), zh: 'CD3ζ 信号域', en: 'ACTIVATION · ITAMs', dx: -170, dy: 10, hl: 190, color: '#9fe8ff' },
      { type: 'bracket', t0: 8.6, t1: 11.8, side: -1, pad: 190, at: () => [wp(carG, v3(-0.3, 2.55, 0)), wp(carG, v3(-0.3, 1.45, 0))], zh: '源自抗体', en: 'FROM AN ANTIBODY' },
      { type: 'bracket', t0: 9.0, t1: 11.8, side: 1, pad: 330, at: () => [wp(carG, v3(0.3, -0.6, 0)), wp(carG, v3(0.3, -2.9, 0))], zh: '源自 T 细胞信号分子', en: 'FROM T-CELL SIGNALING' },
    ],
    update(t) {
      cam(S.camera, t);
      mem.userData.u.uTime.value = t;
      carG.rotation.y = 0.35 * Math.sin(t * 0.25);
      carG.position.y = mem.userData.surfY(0, 0, t);
      for (const a of anims) a(t);
      // signal pulse travels down CD3ζ, lighting ITAMs in turn
      const sp = ((t - 9.2) % 2.4 + 2.4) % 2.4 / 2.4;
      const live = smoothstep(9.0, 9.4, t) * (1 - smoothstep(12.2, 12.8, t));
      const zc = parts.zetaTube.userData.curve;
      carG.updateMatrixWorld(true);
      pulse.position.copy(carG.localToWorld(zc.getPointAt(clamp(sp)).clone()));
      pulse.material.opacity = 0.9 * live;
      parts.itams.forEach((m, i) => {
        const u = [0.22, 0.55, 0.86][i];
        const hit = Math.exp(-Math.pow((sp - u) * 9, 2)) * live;
        m.material.userData.u.uGlow.value = 0.4 + 2.2 * hit;
      });
      hotTM.position.copy(carG.localToWorld(v3(0, 0, 0)));
      hotTM.material.opacity = 0.35 * envelope(t, 4.2, 6.2, 0.4, 1.2);
      // pull back onto a lawn of receptors
      const f = smoothstep(11.8, 13.8, t);
      for (const { c, d, delay } of field) {
        const a = smoothstep(11.6 + delay + d * 0.12, 12.8 + delay + d * 0.12, t);
        c.visible = a > 0.001;
        c.scale.setScalar(K * a);
        c.position.y = mem.userData.surfY(c.position.x, c.position.z, t);
      }
      mem.userData.u.uFogFar.value = 13 + 8 * f;
      // cutaway facing the camera, filled back in for the pull-back
      const cx = S.camera.position.x;
      const cz = S.camera.position.z;
      const cl = Math.hypot(cx, cz) || 1;
      mem.userData.u.uCut.value.set(cx / cl, cz / cl, 0.02 + 9 * smoothstep(11.8, 13.6, t), 0);
      mem.userData.u.uCut.value.w = 0.02 + 9 * smoothstep(11.8, 13.6, t);
      S.tick(t);
    },
  };
}
