import * as THREE from 'three';
import { ease as E, invLerp, smoothstep, wobble } from './util.js';

const cr = (p0, p1, p2, p3, s) => {
  const s2 = s * s;
  const s3 = s2 * s;
  return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s3);
};

function crVec(keys, i, s, field) {
  const n = keys.length;
  const k0 = keys[Math.max(0, i - 1)][field];
  const k1 = keys[i][field];
  const k2 = keys[Math.min(n - 1, i + 1)][field];
  const k3 = keys[Math.min(n - 1, i + 2)][field];
  return [0, 1, 2].map((j) => cr(k0[j], k1[j], k2[j], k3[j], s));
}

const _t = new THREE.Vector3();

// Keyframed camera move. keys: [{ t, p:[x,y,z], l:[x,y,z], fov?, roll? }]
// mode 'global' eases the whole move (smooth through intermediate keys);
// mode 'seg' eases every segment (the camera settles on each key).
export function camPath(keys, { mode = 'global', ease = E.inOutSine, shake = 0.012, shakeSpeed = 0.6, seed = 0 } = {}) {
  const t0 = keys[0].t;
  const tn = keys[keys.length - 1].t;
  const sample = (t) => {
    let tt;
    if (keys.length === 1) tt = t0;
    else if (mode === 'global') tt = t0 + ease(invLerp(t0, tn, t)) * (tn - t0);
    else tt = Math.min(Math.max(t, t0), tn);
    let i = 0;
    while (i < keys.length - 2 && tt > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    let s = b.t > a.t ? invLerp(a.t, b.t, tt) : 0;
    if (mode === 'seg') s = (b.ease || ease)(s);
    const p = keys.length === 1 ? a.p : crVec(keys, i, s, 'p');
    const l = keys.length === 1 ? a.l : crVec(keys, i, s, 'l');
    const fa = a.fov ?? 35;
    const fb = b.fov ?? fa;
    const fov = fa + (fb - fa) * smoothstep(0, 1, s);
    const ra = a.roll ?? 0;
    const rb = b.roll ?? ra;
    const roll = ra + (rb - ra) * smoothstep(0, 1, s);
    return { p, l, fov, roll };
  };
  const apply = (camera, t) => {
    const { p, l, fov, roll } = sample(t);
    const k = shake;
    const ts = t * shakeSpeed;
    camera.position.set(
      p[0] + k * wobble(ts, seed + 1),
      p[1] + k * wobble(ts, seed + 2),
      p[2] + k * 0.6 * wobble(ts, seed + 3),
    );
    _t.set(l[0] + k * 0.5 * wobble(ts * 0.8, seed + 4), l[1] + k * 0.5 * wobble(ts * 0.8, seed + 5), l[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(_t);
    if (roll) camera.rotateZ(roll);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
  };
  apply.sample = sample;
  return apply;
}

export function makeCamera(fov = 35) {
  const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.03, 400);
  return c;
}
