import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHADE } from './glsl.js';
import { color } from './common.js';
import { rng } from '../engine/util.js';

// One phospholipid: a head bead and two tails pointing to -Y.
function lipidGeometry() {
  const parts = [];
  const add = (g, part) => {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
    parts.push(g);
  };
  const head = new THREE.IcosahedronGeometry(0.068, 1);
  add(head, 0);
  for (const s of [-1, 1]) {
    const tl = new THREE.CylinderGeometry(0.014, 0.01, 0.17, 5, 1, true);
    tl.translate(s * 0.022, -0.14, 0);
    add(tl, 1);
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

const VS = /* glsl */ `
attribute vec3 aPos;   // x, z, leaflet (+1 outer / -1 inner)
attribute vec4 aRand;
attribute float aPart;
uniform float uTime; uniform float uCurv; uniform float uAmp; uniform float uHalf; uniform float uR; uniform float uScale;
uniform vec4 uClear0; uniform vec4 uClear1; uniform vec4 uClear2; uniform vec4 uClear3;
uniform float uWaveF;
uniform vec4 uCut;
varying vec3 vW; varying vec3 vN; varying float vPart; varying float vRand; varying float vSide;
vec3 surf(vec2 q) {
  float y = -uCurv * dot(q, q) + uAmp * sin(q.x * uWaveF + uTime * 0.5) * cos(q.y * uWaveF * 0.8 - uTime * 0.35);
  return vec3(q.x, y, q.y);
}
vec2 clearOut(vec2 q, vec4 c) {
  if (c.w <= 0.0) return q;
  vec2 d = q - c.xy;
  float l = length(d);
  float push = c.w * max(0.0, c.z - l) * smoothstep(0.0, 0.25, c.z - l + 0.25);
  return q + (l > 1e-4 ? d / l : vec2(1.0, 0.0)) * push;
}
void main() {
  vec2 q = aPos.xy;
  q = clearOut(q, uClear0);
  q = clearOut(q, uClear1);
  q = clearOut(q, uClear2);
  q = clearOut(q, uClear3);
  float side = aPos.z;
  vec3 S = surf(q);
  const float e = 0.05;
  vec3 nrm = normalize(cross(surf(q + vec2(0.0, e)) - S, surf(q + vec2(e, 0.0)) - S));
  vec3 up = nrm * side;
  vec3 center = S + nrm * side * uHalf;
  vec3 ref = abs(up.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 T = normalize(cross(up, ref));
  vec3 B = cross(T, up);
  float a = aRand.z * 6.2831;
  vec3 T2 = T * cos(a) + B * sin(a);
  vec3 B2 = cross(T2, up);
  float edge = 1.0 - smoothstep(uR * 0.7, uR, length(aPos.xy));
  edge *= 1.0 - smoothstep(uCut.w - 0.1, uCut.w, dot(aPos.xy, uCut.xy));
  vec3 lp = position * uScale * edge * (0.9 + 0.2 * aRand.w);
  // tails wiggle a little
  lp.x += sin(uTime * 2.0 + aRand.x * 30.0) * 0.012 * aPart;
  vec3 wp = center + T2 * lp.x + up * lp.y + B2 * lp.z;
  vec3 n = normalize(T2 * normal.x + up * normal.y + B2 * normal.z);
  vec4 w = modelMatrix * vec4(wp, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vPart = aPart;
  vRand = aRand.y;
  vSide = side;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */ `
${SHADE}
uniform vec3 uHead; uniform vec3 uHeadRim; uniform vec3 uTail; uniform vec3 uInnerHead;
uniform float uFog; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uOpacity;
uniform float uGlow; uniform vec3 uGlowC;
varying vec3 vW; varying vec3 vN; varying float vPart; varying float vRand; varying float vSide;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 head = mix(uInnerHead, uHead, step(0.0, vSide));
  vec3 base = mix(head, uTail, vPart);
  vec3 col = tissueShade(N, V, base * 0.4, base * (0.85 + 0.3 * vRand), uHeadRim * (1.0 - 0.6 * vPart), 2.2, 0.7, 0.5 * (1.0 - vPart), 30.0);
  col += uGlowC * uGlow * (1.0 - vPart);
  float d = length(cameraPosition - vW);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, d) * uFog);
  gl_FragColor = vec4(col, uOpacity);
}
`;

export function createMembrane(
  lights,
  { radius = 6, spacing = 0.15, curv = 0.0, amp = 0.05, waveF = 0.8, half = 0.215, seed = 1, head = '#9fd6e8', innerHead = null, headRim = '#d8f6ff', tail = '#3c6474', fog = 0.9, fogColor = '#02060c', fogNear = 4, fogFar = 14 } = {},
) {
  const base = lipidGeometry();
  const r = rng(seed * 331 + 5);
  const pos = [];
  const rnd = [];
  const dy = (spacing * Math.sqrt(3)) / 2;
  for (const side of [1, -1]) {
    let row = 0;
    for (let z = -radius; z <= radius; z += dy, row++) {
      for (let x = -radius + (row % 2 ? spacing / 2 : 0); x <= radius; x += spacing) {
        const jx = x + (r() - 0.5) * spacing * 0.35;
        const jz = z + (r() - 0.5) * spacing * 0.35;
        if (jx * jx + jz * jz > radius * radius) continue;
        pos.push(jx, jz, side);
        rnd.push(r(), r(), r(), r());
      }
    }
  }
  const n = pos.length / 3;
  const g = new THREE.InstancedBufferGeometry();
  for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aRand', new THREE.InstancedBufferAttribute(new Float32Array(rnd), 4));
  g.instanceCount = n;
  const u = {
    uTime: { value: 0 },
    uCurv: { value: curv },
    uAmp: { value: amp },
    uWaveF: { value: waveF },
    uCut: { value: new THREE.Vector4(0, 1, 0, 99) },
    uHalf: { value: half },
    uR: { value: radius },
    uScale: { value: 1 },
    uClear0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClear1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClear2: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClear3: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHead: { value: color(head) },
    uInnerHead: { value: color(innerHead || head) },
    uHeadRim: { value: color(headRim) },
    uTail: { value: color(tail) },
    uFog: { value: fog },
    uFogColor: { value: color(fogColor) },
    uFogNear: { value: fogNear },
    uFogFar: { value: fogFar },
    uOpacity: { value: 1 },
    uGlow: { value: 0 },
    uGlowC: { value: color(headRim) },
  };
  const m = new THREE.ShaderMaterial({ uniforms: { ...lights, ...u }, vertexShader: VS, fragmentShader: FS });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.userData.u = u;
  // Height of the membrane mid-plane at (x, z) at time t, matching the shader.
  mesh.userData.surfY = (x, z, t) => -u.uCurv.value * (x * x + z * z) + u.uAmp.value * Math.sin(x * u.uWaveF.value + t * 0.5) * Math.cos(z * u.uWaveF.value * 0.8 - t * 0.35);
  mesh.userData.count = n;
  return mesh;
}
