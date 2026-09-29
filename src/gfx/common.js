import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Per-scene lighting shared by every custom material through uniform references,
// so changing a scene's key light updates all of its objects at once.
export function makeLights({
  keyDir = [-0.6, 0.7, 0.55],
  key = '#fff1e0',
  keyIntensity = 1.25,
  fill = '#20324a',
  fillIntensity = 0.55,
  back = '#9fe8ff',
  backIntensity = 1.0,
} = {}) {
  return {
    uKeyDir: { value: new THREE.Vector3(...keyDir).normalize() },
    uKeyColor: { value: new THREE.Color(key).multiplyScalar(keyIntensity) },
    uFillColor: { value: new THREE.Color(fill).multiplyScalar(fillIntensity) },
    uBackColor: { value: new THREE.Color(back).multiplyScalar(backIntensity) },
  };
}

export const color = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

const sphereCache = new Map();
// Indexed icosphere (each vertex shared), so the vertex shader runs once per vertex.
export function icosphere(detail = 48) {
  if (!sphereCache.has(detail)) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    const m = mergeVertices(g, 1e-5);
    m.computeVertexNormals();
    sphereCache.set(detail, m);
  }
  return sphereCache.get(detail);
}

let glowTex = null;
// Soft radial falloff used for halos, bokeh and light blooms.
export function glowTexture() {
  if (glowTex) return glowTex;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (x + 0.5) / s - 0.5;
      const dy = (y + 0.5) / s - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, Math.exp(-r * r * 4.2) - Math.exp(-4.2)) / (1 - Math.exp(-4.2));
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.needsUpdate = true;
  return glowTex;
}

// Additive glow billboard. `color` may exceed 1 for HDR bloom.
export function glowSprite(hex, size = 1, opacity = 0.3, k = 1) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: color(hex, k),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

// Screen-aligned quad drawn at the far plane: gradient + slow nebulous noise.
export function makeBackdrop({ inner = '#0b1a2c', outer = '#02040a', accent = '#123049', accentAmt = 0.35, center = [0.55, 0.5] } = {}) {
  const uniforms = {
    uInner: { value: color(inner) },
    uOuter: { value: color(outer) },
    uAccent: { value: color(accent) },
    uAccentAmt: { value: accentAmt },
    uCenter: { value: new THREE.Vector2(...center) },
    uTime: { value: 0 },
    uAspect: { value: 16 / 9 },
    uBright: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uInner; uniform vec3 uOuter; uniform vec3 uAccent;
      uniform float uAccentAmt; uniform vec2 uCenter; uniform float uTime; uniform float uAspect; uniform float uBright;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.02 + 3.1; a *= 0.5; } return s; }
      void main() {
        vec2 p = (vUv - uCenter) * vec2(uAspect, 1.0);
        float r = length(p);
        vec3 col = mix(uInner, uOuter, smoothstep(0.0, 1.05, r));
        float n = fbm(vUv * vec2(uAspect, 1.0) * 2.2 + vec2(uTime * 0.012, -uTime * 0.008));
        col += uAccent * uAccentAmt * smoothstep(0.35, 0.85, n) * (1.0 - smoothstep(0.2, 1.2, r));
        gl_FragColor = vec4(col * uBright, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
