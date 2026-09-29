import * as THREE from 'three';
import { rng } from '../engine/util.js';
import { color } from './common.js';

// Drifting specks with a cheap depth-of-field: points far from the focus
// distance grow into soft discs and lose intensity, like lens bokeh.
export function createDust({
  count = 420,
  box = [22, 13, 22],
  center = [0, 0, 0],
  tint = '#a9dcff',
  tint2 = null,
  size = 0.045,
  focus = 7,
  aperture = 0.35,
  opacity = 0.55,
  speed = 0.04,
  seed = 1,
  intensity = 1.6,
} = {}) {
  const r = rng(seed * 7717 + 3);
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * box[0];
    pos[i * 3 + 1] = (r() - 0.5) * box[1];
    pos[i * 3 + 2] = (r() - 0.5) * box[2];
    rnd.set([r(), r(), r(), r()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: size },
    uFocus: { value: focus },
    uAperture: { value: aperture },
    uOpacity: { value: opacity },
    uScale: { value: 800 },
    uBox: { value: new THREE.Vector3(...box) },
    uCenter: { value: new THREE.Vector3(...center) },
    uColor: { value: color(tint, intensity) },
    uColor2: { value: color(tint2 || tint, intensity) },
    uSpeed: { value: speed },
    uFlow: { value: new THREE.Vector3(0, 0, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aRand;
      uniform float uTime; uniform float uSize; uniform float uFocus; uniform float uAperture;
      uniform float uOpacity; uniform float uScale; uniform vec3 uBox; uniform vec3 uCenter; uniform float uSpeed;
      uniform vec3 uFlow;
      varying float vAlpha; varying float vMix;
      void main() {
        vec3 p = position;
        float t = uTime;
        p += vec3(sin(t * 0.21 * (0.5 + aRand.x) + aRand.y * 6.28),
                  cos(t * 0.17 * (0.5 + aRand.z) + aRand.w * 6.28),
                  sin(t * 0.13 * (0.5 + aRand.w) + aRand.x * 6.28)) * 0.3;
        p.y += t * uSpeed * (0.4 + aRand.z);
        p += uFlow * t * (0.6 + 0.8 * aRand.x);
        p = mod(p + uBox * 0.5, uBox) - uBox * 0.5;
        vec4 mv = modelViewMatrix * vec4(p + uCenter, 1.0);
        float depth = max(0.05, -mv.z);
        float px = uSize * (0.5 + aRand.w) * uScale / depth;
        float blur = abs(depth - uFocus) * uAperture * uScale / (depth * 40.0);
        float s = max(1.2, px + blur);
        gl_PointSize = s;
        float energy = clamp((px * px + 1.0) / (s * s), 0.015, 1.0);
        vAlpha = uOpacity * (0.35 + 0.65 * aRand.y) * energy;
        vMix = aRand.x;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uColor2;
      varying float vAlpha; varying float vMix;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        if (r > 1.0) discard;
        float disc = smoothstep(1.0, 0.78, r) * (0.72 + 0.28 * smoothstep(0.35, 0.92, r));
        vec3 col = mix(uColor, uColor2, step(0.7, vMix));
        gl_FragColor = vec4(col * disc * vAlpha, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.u = uniforms;
  pts.userData.update = (time, camera, renderer) => {
    uniforms.uTime.value = time;
    if (renderer) {
      const h = renderer.size.y * renderer.dpr;
      uniforms.uScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }
  };
  return pts;
}
