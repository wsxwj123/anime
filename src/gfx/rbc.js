import * as THREE from 'three';
import { SHADE } from './glsl.js';
import { color } from './common.js';

// Biconcave red blood cell from the Evans–Fung profile, lathed around Y.
export function rbcGeometry(segments = 40) {
  const R = 1;
  const c0 = 0.207;
  const c2 = 2.003;
  const c4 = -1.123;
  const pts = [];
  const N = 28;
  const half = (r) => {
    const x = r / R;
    const s = Math.max(0, 1 - x * x);
    return 0.5 * R * Math.sqrt(s) * (c0 + c2 * x * x + c4 * x * x * x * x);
  };
  // top surface from centre to rim, then bottom surface back to centre
  for (let i = 0; i <= N; i++) {
    const r = R * Math.sin((i / N) * (Math.PI / 2));
    pts.push(new THREE.Vector2(Math.max(r, 1e-3), half(r) + 0.012));
  }
  for (let i = N; i >= 0; i--) {
    const r = R * Math.sin((i / N) * (Math.PI / 2));
    pts.push(new THREE.Vector2(Math.max(r, 1e-3), -half(r) - 0.012));
  }
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

const VS = /* glsl */ `
attribute float aShade;
varying vec3 vW; varying vec3 vN; varying float vShade;
void main() {
  vec4 lp = instanceMatrix * vec4(position, 1.0);
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vShade = aShade;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FS = /* glsl */ `
${SHADE}
uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uRim; uniform float uOpacity; uniform float uFog; uniform vec3 uFogColor;
uniform float uFogNear; uniform float uFogFar; uniform float uDim;
varying vec3 vW; varying vec3 vN; varying float vShade;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  vec3 col = tissueShade(N, V, uDeep, uMid * (0.8 + 0.4 * vShade), uRim, 2.0, 0.55, 0.55, 30.0);
  float d = length(cameraPosition - vW);
  float f = smoothstep(uFogNear, uFogFar, d) * uFog;
  col = mix(col, uFogColor, f) * uDim;
  gl_FragColor = vec4(col, uOpacity);
}
`;

// count instances; caller sets matrices each frame via setMatrixAt().
export function createRBCs(lights, count, { deep = '#3a0008', mid = '#b01228', rim = '#ff5a64', fog = 0, fogColor = '#1a0206', fogNear = 6, fogFar = 30, seed = 1 } = {}) {
  const g = rbcGeometry();
  const shade = new Float32Array(count);
  let a = seed * 9301 + 49297;
  for (let i = 0; i < count; i++) {
    a = (a * 9301 + 49297) % 233280;
    shade[i] = a / 233280;
  }
  g.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 1));
  const u = {
    uDeep: { value: color(deep) },
    uMid: { value: color(mid) },
    uRim: { value: color(rim) },
    uOpacity: { value: 1 },
    uFog: { value: fog },
    uFogColor: { value: color(fogColor) },
    uFogNear: { value: fogNear },
    uFogFar: { value: fogFar },
    uDim: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({ uniforms: { ...lights, ...u }, vertexShader: VS, fragmentShader: FS });
  const mesh = new THREE.InstancedMesh(g, m, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.userData.u = u;
  return mesh;
}
