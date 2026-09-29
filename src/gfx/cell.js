import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE, SHADE, CELL_SHAPE } from './glsl.js';
import { icosphere, glowSprite, color } from './common.js';
import { rng, fibonacciSphere } from '../engine/util.js';

// Colour sets. deep/mid are body tones, rim is the translucent edge glow,
// glow is used for activation, pulses and bloom-heavy moments.
export const PALETTES = {
  tcell: { deep: '#073a50', mid: '#3fa6c8', rim: '#86ecff', glow: '#4fd3ff', nucleus: '#06233a' },
  tcellRest: { deep: '#122e3a', mid: '#5b8c9e', rim: '#a4d6e6', glow: '#58d6ff', nucleus: '#0e2230' },
  tumor: { deep: '#4a0b2c', mid: '#c2457f', rim: '#ff8ec0', glow: '#ff4f96', nucleus: '#3a0a30' },
  healthy: { deep: '#1a2233', mid: '#66789a', rim: '#b4c3dc', glow: '#9fb3d6', nucleus: '#171d2c' },
  endo: { deep: '#4a1018', mid: '#b04a56', rim: '#ffa0a0', glow: '#ff7a7a', nucleus: '#3a0c14' },
  wbc: { deep: '#27313c', mid: '#9aa9b8', rim: '#e4eef6', glow: '#bcd4e8', nucleus: '#1d2430' },
};

export const RECEPTOR_COLORS = {
  car: { base: '#a86a14', tip: '#f2b23a', glow: '#ffbf4a' },
  antigen: { base: '#8a2c5c', tip: '#f59ac8', glow: '#ff9ccb' },
  tcr: { base: '#2a5c6e', tip: '#8fd8ee', glow: '#7fe6ff' },
  antibody: { base: '#8c96a3', tip: '#e9eef5', glow: '#cfe3ff' },
  spike: { base: '#6a58c8', tip: '#d6c8ff', glow: '#b49cff' },
  pore: { base: '#3a4f8a', tip: '#a9c2ff', glow: '#8fb0ff' },
};

function shapeUniforms(seed, o) {
  const r = rng(seed * 7919 + 13);
  return {
    uTime: { value: 0 },
    uSeed: { value: new THREE.Vector3(r() * 50, r() * 50, r() * 50) },
    uDisp: { value: o.disp ?? 0.06 },
    uDispFreq: { value: o.dispFreq ?? 1.3 },
    uDispSpeed: { value: o.dispSpeed ?? 0.1 },
    uVilli: { value: o.villi ?? 0.02 },
    uVilliFreq: { value: o.villiFreq ?? 9.0 },
    uBleb: { value: 0 },
    uContact0: { value: new THREE.Vector4(0, 1, 0, 9) },
    uContact1: { value: new THREE.Vector4(0, 1, 0, 9) },
    uContact2: { value: new THREE.Vector4(0, 1, 0, 9) },
    uStretch: { value: new THREE.Vector4(0, 1, 0, 0) },
    uPinchAxis: { value: new THREE.Vector4(0, 1, 0, 0) },
    uPinch: { value: new THREE.Vector3(0, 0.35, 0.2) },
    uPit: { value: new THREE.Vector4(0, 1, 0, 0) },
    uPitW: { value: 0.3 },
  };
}

const BODY_VS = /* glsl */ `
${NOISE}
${CELL_SHAPE}
varying vec3 vW;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vDir;
void main() {
  vec3 d = normalize(position);
  vec3 P, N;
  cellFrame(d, P, N);
  vObj = P;
  vDir = d;
  vec4 wp = modelMatrix * vec4(P, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * N);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BODY_FS = /* glsl */ `
${NOISE}
${SHADE}
uniform vec3 uSeed;
uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uRim;
uniform float uFresPow; uniform float uRimAmt; uniform float uSpec; uniform float uGloss;
uniform vec3 uGlowColor; uniform float uGlow; uniform float uOpacity; uniform float uDark;
uniform vec3 uCamObj; uniform vec4 uNucleus; uniform vec3 uNucColor; uniform float uNucVis;
uniform vec4 uPulse; uniform float uPulseAmt;
uniform vec4 uHot;
uniform vec3 uHotColor;
uniform float uTexScale;
uniform float uSoft;
varying vec3 vW; varying vec3 vN; varying vec3 vObj; varying vec3 vDir;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  float micro = snoise(vObj * 5.0 * uTexScale + uSeed) * 0.5 + 0.5;
  float fine = snoise(vObj * 19.0 * uTexScale - uSeed) * 0.5 + 0.5;
  vec3 deep = uDeep * (0.85 + 0.3 * micro);
  vec3 mid = uMid * (0.9 + 0.2 * fine);
  vec3 col = tissueShade(N, V, deep, mid, uRim, uFresPow, uRimAmt, uSpec, uGloss);

  if (uNucVis > 0.0) {
    vec3 rd = normalize(vObj - uCamObj);
    vec3 oc = uCamObj - uNucleus.xyz;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - uNucleus.w * uNucleus.w;
    float disc = b * b - c;
    if (disc > 0.0) {
      float chord = sqrt(disc) / uNucleus.w;
      float k = smoothstep(0.0, 0.9, chord);
      col = mix(col, uNucColor * (0.5 + 0.9 * (1.0 - k)) , k * uNucVis);
    }
  }

  float ndv = clamp(dot(N, V), 0.0, 1.0);
  col += uGlowColor * uGlow * (0.18 + 1.2 * pow(1.0 - ndv, 2.2));

  vec3 dir = normalize(vDir);
  if (uPulseAmt > 0.0) {
    float ang = acos(clamp(dot(dir, uPulse.xyz), -1.0, 1.0));
    float ring = exp(-pow((ang - uPulse.w) * 5.0, 2.0));
    col += uGlowColor * ring * uPulseAmt;
  }
  if (uHot.w > 0.0) {
    float h = smoothstep(0.72, 0.99, dot(dir, uHot.xyz));
    col += uHotColor * h * uHot.w;
  }
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l) * vec3(0.95, 0.85, 0.9), uDark * 0.75) * (1.0 - 0.6 * uDark);
  float a = uOpacity;
  if (uSoft > 0.0) a *= smoothstep(0.0, uSoft, ndv);
  gl_FragColor = vec4(col, a);
}
`;

const REC_VS = /* glsl */ `
${NOISE}
${CELL_SHAPE}
attribute vec3 aDir;
attribute float aSpin;
attribute float aScale;
attribute float aDelay;
attribute float aRand;
attribute float aPart;
uniform float uAppear;
uniform float uLen;
uniform vec4 uBindDir;
uniform float uSway;
varying vec3 vW; varying vec3 vN; varying float vPart; varying float vRand; varying float vBind;
void main() {
  vec3 P, N;
  cellFrame(aDir, P, N);
  vec3 up = abs(N.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(up, N));
  vec3 B = cross(N, T);
  float c = cos(aSpin), s = sin(aSpin);
  vec3 T2 = T * c + B * s;
  vec3 B2 = cross(N, T2);
  float a = smoothstep(aDelay, aDelay + 0.18, uAppear);
  float sc = aScale * uLen * a;
  vec3 lp = position * sc;
  float sway = uSway * lp.y;
  lp.x += sin(uTime * 1.1 + aRand * 31.0) * sway * 0.35;
  lp.z += cos(uTime * 0.9 + aRand * 17.0) * sway * 0.35;
  vec3 obj = P - N * 0.004 + T2 * lp.x + N * lp.y + B2 * lp.z;
  vec3 objN = normalize(T2 * normal.x + N * normal.y + B2 * normal.z);
  vec4 wp = modelMatrix * vec4(obj, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * objN);
  vPart = aPart;
  vRand = aRand;
  vBind = smoothstep(0.86, 0.975, dot(aDir, uBindDir.xyz)) * uBindDir.w;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const REC_FS = /* glsl */ `
${SHADE}
uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uGlowC;
uniform float uGlow; uniform float uOpacity;
varying vec3 vW; varying vec3 vN; varying float vPart; varying float vRand; varying float vBind;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 base = mix(uBase, uTip, smoothstep(0.2, 0.8, vPart));
  vec3 col = tissueShade(N, V, base * 0.18, base, base * 1.25, 3.2, 0.45, 1.0, 46.0);
  col *= 0.85 + 0.3 * vRand;
  col += uGlowC * (uGlow * 0.6 * (0.15 + 0.85 * vPart) + vBind * 1.8 * (0.3 + vPart));
  gl_FragColor = vec4(col, uOpacity);
}
`;

// Receptor silhouettes, each ~1 unit tall with the stalk along +Y.
// Indexed and low-poly: hundreds of these ride on every cell.
function receptorGeometry(kind) {
  const parts = [];
  const add = (g, part) => {
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g, 1e-4);
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
    parts.push(g);
  };
  const lobe = (r, sx, sy, sz, x, y, z) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return g;
  };
  const stalk = (r0, r1, h, y) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, 6, 1, true);
    g.translate(0, y, 0);
    return g;
  };
  if (kind === 'car') {
    add(stalk(0.05, 0.07, 0.62, 0.31), 0.0);
    add(lobe(0.17, 1, 1.25, 1, -0.12, 0.78, 0), 1.0);
    add(lobe(0.16, 1, 1.2, 1, 0.12, 0.76, 0.02), 1.0);
  } else if (kind === 'antigen') {
    add(stalk(0.05, 0.07, 0.4, 0.2), 0.0);
    add(lobe(0.19, 1, 1, 1, 0, 0.52, 0), 0.7);
    add(lobe(0.15, 1, 1, 1, 0.05, 0.8, 0.03), 1.0);
  } else if (kind === 'antibody') {
    add(stalk(0.07, 0.08, 0.45, 0.22), 0.0);
    for (const sgn of [-1, 1]) {
      const arm = new THREE.CylinderGeometry(0.065, 0.07, 0.5, 6, 1, true);
      arm.translate(0, 0.25, 0);
      arm.rotateZ(sgn * 0.62);
      arm.translate(0, 0.42, 0);
      add(arm, 1.0);
    }
  } else if (kind === 'pore') {
    const ring = new THREE.TorusGeometry(0.5, 0.2, 5, 12);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 0.05, 0);
    add(ring, 1.0);
  } else if (kind === 'spike') {
    add(stalk(0.07, 0.09, 0.5, 0.25), 0.0);
    add(lobe(0.2, 1, 0.8, 1, 0, 0.58, 0), 1.0);
  } else {
    // short TCR-like stub
    add(stalk(0.06, 0.08, 0.5, 0.25), 0.0);
    add(lobe(0.16, 1, 1, 1, 0, 0.6, 0), 1.0);
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

const recGeoCache = new Map();
function getReceptorGeometry(kind) {
  if (!recGeoCache.has(kind)) recGeoCache.set(kind, receptorGeometry(kind));
  return recGeoCache.get(kind);
}

// Receptors that sit exactly on the animated membrane of `u` (shared uniforms).
export function createReceptors({ u, lights, kind = 'car', count = 180, length = 0.16, seed = 1, colors, sway = 0.25, dirs = null }) {
  const base = getReceptorGeometry(kind);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  for (const k of Object.keys(base.attributes)) geo.setAttribute(k, base.attributes[k]);
  const r = rng(seed * 104729 + 7);
  const points = dirs || fibonacciSphere(count, 0.6, r);
  const n = points.length;
  const aDir = new Float32Array(n * 3);
  const aSpin = new Float32Array(n);
  const aScale = new Float32Array(n);
  const aDelay = new Float32Array(n);
  const aRand = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    aDir.set(points[i], i * 3);
    aSpin[i] = r() * Math.PI * 2;
    aScale[i] = 0.75 + r() * 0.45;
    aDelay[i] = r() * 0.8;
    aRand[i] = r();
  }
  geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(aDir, 3));
  geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(aSpin, 1));
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));
  geo.setAttribute('aDelay', new THREE.InstancedBufferAttribute(aDelay, 1));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(aRand, 1));
  geo.instanceCount = n;
  const c = colors || RECEPTOR_COLORS[kind] || RECEPTOR_COLORS.car;
  const ru = {
    uAppear: { value: 1 },
    uLen: { value: length },
    uBindDir: { value: new THREE.Vector4(0, 1, 0, 0) },
    uSway: { value: sway },
    uBase: { value: color(c.base) },
    uTip: { value: color(c.tip) },
    uGlowC: { value: color(c.glow) },
    uGlow: { value: 0.12 },
    uOpacity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...u, ...lights, ...ru },
    vertexShader: REC_VS,
    fragmentShader: REC_FS,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.u = ru;
  return mesh;
}

// A hero cell: displaced membrane body + optional receptors + soft halo.
export function createCell({
  lights,
  palette = 'tcell',
  seed = 1,
  detail = 56,
  disp,
  dispFreq,
  dispSpeed,
  villi,
  villiFreq,
  receptors = null,
  receptors2 = null,
  halo = true,
  haloSize = 2.7,
  haloOpacity = 0.22,
  nucleus = null,
  rimAmt = 0.95,
  fresPow = 2.4,
  spec = 0.26,
  gloss = 24,
  texScale = 1,
} = {}) {
  const pal = typeof palette === 'string' ? PALETTES[palette] : palette;
  const u = shapeUniforms(seed, { disp, dispFreq, dispSpeed, villi, villiFreq });
  const bu = {
    uDeep: { value: color(pal.deep) },
    uMid: { value: color(pal.mid) },
    uRim: { value: color(pal.rim) },
    uFresPow: { value: fresPow },
    uRimAmt: { value: rimAmt },
    uSpec: { value: spec },
    uGloss: { value: gloss },
    uGlowColor: { value: color(pal.glow) },
    uGlow: { value: 0 },
    uOpacity: { value: 1 },
    uDark: { value: 0 },
    uCamObj: { value: new THREE.Vector3() },
    uNucleus: { value: new THREE.Vector4(0.12, 0.05, -0.1, 0.55) },
    uNucColor: { value: color(pal.nucleus) },
    uNucVis: { value: 0 },
    uPulse: { value: new THREE.Vector4(0, 1, 0, 0) },
    uPulseAmt: { value: 0 },
    uHot: { value: new THREE.Vector4(0, 1, 0, 0) },
    uHotColor: { value: color(pal.glow) },
    uTexScale: { value: texScale },
    uSoft: { value: 0 },
  };
  if (nucleus) {
    const [x, y, z] = nucleus.offset || [0.12, 0.05, -0.1];
    bu.uNucleus.value.set(x, y, z, nucleus.radius ?? 0.55);
    bu.uNucVis.value = nucleus.vis ?? 0.55;
    if (nucleus.color) bu.uNucColor.value = color(nucleus.color);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...u, ...lights, ...bu },
    vertexShader: BODY_VS,
    fragmentShader: BODY_FS,
    transparent: true,
  });
  const body = new THREE.Mesh(icosphere(detail), mat);
  body.frustumCulled = false;
  const group = new THREE.Group();
  group.add(body);

  let rec = null;
  let rec2 = null;
  if (receptors) {
    rec = createReceptors({ u, lights, seed, ...receptors });
    group.add(rec);
  }
  if (receptors2) {
    rec2 = createReceptors({ u, lights, seed: seed + 101, ...receptors2 });
    group.add(rec2);
  }
  let haloSprite = null;
  if (halo) {
    haloSprite = glowSprite(pal.glow, haloSize, haloOpacity, 1.0);
    group.add(haloSprite);
  }

  const tmp = new THREE.Vector3();
  const cell = {
    group,
    body,
    u,
    b: bu,
    rec,
    rec2,
    halo: haloSprite,
    mat,
    // Call once per frame after the group's transform is final.
    update(time, camera) {
      u.uTime.value = time;
      if (bu.uNucVis.value > 0 && camera) {
        group.updateMatrixWorld(true);
        tmp.copy(camera.position);
        body.worldToLocal(tmp);
        bu.uCamObj.value.copy(tmp);
      }
    },
    set opacity(v) {
      bu.uOpacity.value = v;
      if (rec) rec.userData.u.uOpacity.value = v;
      if (rec2) rec2.userData.u.uOpacity.value = v;
      if (haloSprite) haloSprite.material.opacity = haloOpacity * v;
      group.visible = v > 0.001;
    },
    // Flatten the membrane against a plane at `dist` along local direction `dir`.
    contact(i, dir, dist) {
      const c = u[`uContact${i}`].value;
      if (dist == null || dist > 1.9) {
        c.w = 9;
        return;
      }
      tmp.set(dir[0] ?? dir.x, dir[1] ?? dir.y, dir[2] ?? dir.z).normalize();
      c.set(tmp.x, tmp.y, tmp.z, dist);
    },
    // Same, but with the contact given as a world-space point the membrane should touch.
    contactToward(i, worldPoint, gap = 0) {
      group.updateMatrixWorld(true);
      tmp.copy(worldPoint);
      group.worldToLocal(tmp);
      const d = tmp.length();
      const c = u[`uContact${i}`].value;
      if (d < 1e-4) return;
      c.set(tmp.x / d, tmp.y / d, tmp.z / d, Math.max(0.2, d - gap));
    },
  };
  return cell;
}

// World-space point on a cell's (undisplaced) surface in a local direction;
// good enough for label anchors and aiming.
export function surfacePoint(cell, dir, lift = 1.0) {
  const v = new THREE.Vector3(...dir).normalize().multiplyScalar(lift);
  cell.group.updateMatrixWorld(true);
  return cell.group.localToWorld(v);
}
