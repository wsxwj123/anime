import * as THREE from 'three';
import { SHADE } from './glsl.js';
import { color } from './common.js';

// Inside of a blood vessel: elongated endothelial cells (Voronoi in
// cylindrical coordinates), wet highlights and depth fog.
export function createVessel(lights, { radius = 2.2, length = 80, fogColor = '#1a0306', fogNear = 3, fogFar = 26 } = {}) {
  const g = new THREE.CylinderGeometry(radius, radius, length, 96, 60, true);
  g.rotateX(Math.PI / 2); // axis along z
  const u = {
    uR: { value: radius },
    uTime: { value: 0 },
    uBase: { value: color('#8c2a36') },
    uEdge: { value: color('#ff9aa2') },
    uNuc: { value: color('#c0506a') },
    uFog: { value: color(fogColor) },
    uFogNear: { value: fogNear },
    uFogFar: { value: fogFar },
    uOpacity: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: { ...lights, ...u },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vP; varying vec3 vN;
      void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      ${SHADE}
      uniform float uR; uniform vec3 uBase; uniform vec3 uEdge; uniform vec3 uNuc; uniform vec3 uFog;
      uniform float uFogNear; uniform float uFogFar; uniform float uOpacity;
      varying vec3 vW; varying vec3 vP; varying vec3 vN;
      vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      // returns F1, F2, and the cell centre offset
      vec4 voro(vec2 x) {
        vec2 n = floor(x), f = fract(x);
        float f1 = 8.0, f2 = 8.0; vec2 c1 = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = h2(n + g);
          vec2 r = g + o - f;
          float d = dot(r, r);
          if (d < f1) { f2 = f1; f1 = d; c1 = r; } else if (d < f2) { f2 = d; }
        }
        return vec4(sqrt(f1), sqrt(f2), c1);
      }
      float domeAt(vec2 uv, out vec4 v, out float nuc) {
        v = voro(uv);
        nuc = 1.0 - smoothstep(0.1, 0.32, length(v.zw * vec2(1.0, 1.6)));
        return smoothstep(0.0, 0.5, v.x) * -0.35 + nuc * 0.25;
      }
      void main() {
        float ang = atan(vP.y, vP.x);
        vec2 uv = vec2(ang * uR * 1.6, vP.z * 0.55);
        vec4 v; float nuc;
        float d0 = domeAt(uv, v, nuc);
        vec4 vx; float nx; vec4 vy; float ny;
        const float e = 0.03;
        float dx = domeAt(uv + vec2(e, 0.0), vx, nx) - d0;
        float dy = domeAt(uv + vec2(0.0, e), vy, ny) - d0;
        float border = 1.0 - smoothstep(0.0, 0.09, v.y - v.x);
        vec3 radial = normalize(vec3(vP.xy, 0.0));
        vec3 tA = vec3(-sin(ang), cos(ang), 0.0);
        vec3 N = normalize(-radial - (dx / e) * 0.5 * tA - (dy / e) * 0.5 * vec3(0.0, 0.0, 1.0));
        vec3 V = normalize(cameraPosition - vW);
        vec3 base = mix(uBase, uNuc, nuc * 0.6);
        vec3 col = tissueShade(N, V, base * 0.45, base, uEdge, 2.0, 0.5, 0.6, 30.0);
        col += uEdge * border * 0.35;
        float d = length(cameraPosition - vW);
        col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d));
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.userData.u = u;
  return mesh;
}
