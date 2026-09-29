import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHADE } from './glsl.js';
import { color } from './common.js';
import { makeWaves } from '../engine/util.js';

// Static organic shapes (protein domains, beads, capsids): an icosphere with
// baked wave displacement, shaded like tissue. Cheap to draw in quantity.
export function blobGeometry(seed = 1, { detail = 5, amp = 0.08, freq = [1.4, 3.6], waves = 7, scale = [1, 1, 1] } = {}) {
  const g0 = new THREE.IcosahedronGeometry(1, detail);
  g0.deleteAttribute('uv');
  g0.deleteAttribute('normal');
  const g = mergeVertices(g0, 1e-5);
  const f = makeWaves(seed, waves, freq, amp);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + f(x, y, z);
    p.setXYZ(i, x * k * scale[0], y * k * scale[1], z * k * scale[2]);
  }
  g.computeVertexNormals();
  return g;
}

const BLOB_VS = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vIC;
void main() {
  vec4 lp = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    n = mat3(instanceMatrix) * n;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vIC = instanceColor;
  #else
    vIC = vec3(1.0);
  #endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz;
  vL = position;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BLOB_FS = /* glsl */ `
${SHADE}
uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uRim; uniform vec3 uGlowC;
uniform float uGlow; uniform float uOpacity; uniform float uFresPow; uniform float uRimAmt;
uniform float uSpec; uniform float uGloss; uniform float uSoft;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vIC;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  vec3 col = tissueShade(N, V, uDeep * vIC, uMid * vIC, uRim * mix(vec3(1.0), vIC, 0.6), uFresPow, uRimAmt, uSpec, uGloss);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  col += uGlowC * uGlow * (0.35 + 0.65 * pow(1.0 - ndv, 1.5));
  float a = uOpacity;
  if (uSoft > 0.0) a *= smoothstep(0.0, uSoft, ndv);
  gl_FragColor = vec4(col, a);
}
`;

export function blobMaterial(
  lights,
  { deep = '#3a2a10', mid = '#d9a441', rim = '#ffe2a0', glow = '#ffcf6a', glowAmt = 0, fresPow = 2.2, rimAmt = 0.8, spec = 0.45, gloss = 28, opacity = 1, transparent = false, soft = 0, side = THREE.FrontSide, blending = THREE.NormalBlending, depthWrite = true } = {},
) {
  const u = {
    uDeep: { value: color(deep) },
    uMid: { value: color(mid) },
    uRim: { value: color(rim) },
    uGlowC: { value: color(glow) },
    uGlow: { value: glowAmt },
    uOpacity: { value: opacity },
    uFresPow: { value: fresPow },
    uRimAmt: { value: rimAmt },
    uSpec: { value: spec },
    uGloss: { value: gloss },
    uSoft: { value: soft },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: { ...lights, ...u },
    vertexShader: BLOB_VS,
    fragmentShader: BLOB_FS,
    transparent: transparent || opacity < 1,
    side,
    blending,
    depthWrite,
  });
  m.userData.u = u;
  return m;
}

export function blob(lights, seed, geoOpts = {}, matOpts = {}) {
  const mesh = new THREE.Mesh(blobGeometry(seed, geoOpts), blobMaterial(lights, matOpts));
  mesh.userData.u = mesh.material.userData.u;
  return mesh;
}

// Smooth tube along points (hinges, linkers, RNA/DNA strands, IV lines).
export function tube(lights, points, { radius = 0.05, segments = 64, radial = 12, closed = false, tension = 0.5, ...mat } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed, 'catmullrom', tension);
  const g = new THREE.TubeGeometry(curve, segments, radius, radial, closed);
  const mesh = new THREE.Mesh(g, blobMaterial(lights, mat));
  mesh.userData.u = mesh.material.userData.u;
  mesh.userData.curve = curve;
  return mesh;
}

// Clear plastic/glass: almost invisible face-on, bright at grazing angles,
// with a soft streak highlight. Drawn additively so order does not matter.
export function glassMaterial({ tint = '#bfe6ff', edge = 1.2, face = 0.03, streak = 0.6, opacity = 1 } = {}) {
  const u = {
    uTint: { value: color(tint) },
    uEdge: { value: edge },
    uFace: { value: face },
    uStreak: { value: streak },
    uOpacity: { value: opacity },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint; uniform float uEdge; uniform float uFace; uniform float uStreak; uniform float uOpacity;
      varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
        float ndv = abs(dot(N, V));
        float f = pow(1.0 - ndv, 3.0);
        vec3 L = normalize(vec3(-0.5, 0.8, 0.4));
        vec3 R = reflect(-V, N);
        float s = pow(max(dot(R, L), 0.0), 60.0) * uStreak;
        float s2 = smoothstep(0.92, 1.0, max(dot(R, normalize(vec3(0.7, 0.3, 0.6))), 0.0)) * uStreak * 0.5;
        vec3 col = uTint * (uFace + f * uEdge) + vec3(s + s2);
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }
    `,
  });
  m.userData.u = u;
  return m;
}
