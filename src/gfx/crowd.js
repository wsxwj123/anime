import * as THREE from 'three';
import { NOISE, SHADE } from './glsl.js';
import { icosphere, color } from './common.js';
import { PALETTES } from './cell.js';

// Many cells in one draw call. Per instance: transform (instanceMatrix),
// aSeed (shape), aVar = (brightness, glow, dark, division phase).
const VS = /* glsl */ `
${NOISE}
attribute vec3 aSeed;
attribute vec4 aVar;
uniform float uTime; uniform float uDisp; uniform float uVilli;
varying vec3 vW; varying vec3 vN; varying vec3 vDir; varying vec4 vVar; varying vec3 vSeed;
vec3 shape(vec3 d) {
  float r = 1.0 + uDisp * snoise(d * 1.3 + aSeed + vec3(0.0, uTime * 0.1, 0.0));
  float v = snoise(d * 8.0 + aSeed * 1.7);
  r += uVilli * smoothstep(0.15, 0.9, v);
  vec3 p = d * r;
  float div = aVar.w;
  if (div > 0.0) {
    float e = smoothstep(0.0, 0.6, div) * 0.55 + smoothstep(0.6, 1.0, div) * 0.25;
    p.y *= 1.0 + e;
    float pinch = smoothstep(0.25, 1.0, div);
    float k = pinch * exp(-(p.y * p.y) / 0.12);
    p.xz *= 1.0 - 0.92 * k;
    p.xz *= 1.0 - 0.12 * e;
  }
  return p;
}
void main() {
  vec3 d = normalize(position);
  vec3 up = abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(up, d));
  vec3 b = cross(d, t);
  vec3 P = shape(d);
  vec3 p1 = shape(normalize(d + t * 0.02));
  vec3 p2 = shape(normalize(d + b * 0.02));
  vec3 N = normalize(cross(p1 - P, p2 - P));
  vec4 wp = modelMatrix * instanceMatrix * vec4(P, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * N);
  vDir = d;
  vVar = aVar;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FS = /* glsl */ `
${NOISE}
${SHADE}
uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uRim; uniform vec3 uGlowC;
uniform vec3 uSpeckC; uniform float uSpeck; uniform float uOpacity;
uniform float uFog; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform float uGlowAll;
varying vec3 vW; varying vec3 vN; varying vec3 vDir; varying vec4 vVar; varying vec3 vSeed;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 col = tissueShade(N, V, uDeep, uMid * vVar.x, uRim, 2.4, 0.9, 0.3, 24.0);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  col += uGlowC * (vVar.y + uGlowAll) * (0.2 + pow(1.0 - ndv, 2.0));
  if (uSpeck > 0.0) {
    float s = snoise(vDir * 16.0 + vSeed * 3.0);
    col += uSpeckC * smoothstep(0.55, 0.8, s) * uSpeck * (0.4 + 0.6 * ndv);
  }
  float l = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(l) * 0.8, vVar.z * 0.7) * (1.0 - 0.5 * vVar.z);
  float d = length(cameraPosition - vW);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, d) * uFog);
  gl_FragColor = vec4(col, uOpacity);
}
`;

export function createCrowd(lights, count, { palette = 'tcell', detail = 12, disp = 0.07, villi = 0.02, speck = 0, speckColor = '#ffc85a', fog = 0, fogColor = '#03070d', fogNear = 10, fogFar = 60, seed = 1 } = {}) {
  const pal = typeof palette === 'string' ? PALETTES[palette] : palette;
  const g = icosphere(detail).clone();
  const aSeed = new Float32Array(count * 3);
  const aVar = new Float32Array(count * 4);
  let s = seed * 16807;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    aSeed.set([rnd() * 40, rnd() * 40, rnd() * 40], i * 3);
    aVar.set([0.85 + rnd() * 0.3, 0, 0, 0], i * 4);
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 3));
  const varAttr = new THREE.InstancedBufferAttribute(aVar, 4);
  varAttr.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aVar', varAttr);
  const u = {
    uTime: { value: 0 },
    uDisp: { value: disp },
    uVilli: { value: villi },
    uDeep: { value: color(pal.deep) },
    uMid: { value: color(pal.mid) },
    uRim: { value: color(pal.rim) },
    uGlowC: { value: color(pal.glow) },
    uSpeckC: { value: color(speckColor, 1.6) },
    uSpeck: { value: speck },
    uOpacity: { value: 1 },
    uFog: { value: fog },
    uFogColor: { value: color(fogColor) },
    uFogNear: { value: fogNear },
    uFogFar: { value: fogFar },
    uGlowAll: { value: 0 },
  };
  const m = new THREE.ShaderMaterial({ uniforms: { ...lights, ...u }, vertexShader: VS, fragmentShader: FS });
  const mesh = new THREE.InstancedMesh(g, m, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.userData.u = u;
  mesh.userData.var = varAttr;
  return mesh;
}
