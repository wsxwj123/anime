// Shared GLSL chunks.

// 3D simplex noise — Ian McEwan & Stefan Gustavson, Ashima Arts (MIT license),
// https://github.com/ashima/webgl-noise
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm3(vec3 p) {
  return snoise(p) * 0.57 + snoise(p * 2.03 + 11.7) * 0.29 + snoise(p * 4.11 + 3.1) * 0.14;
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// Soft "wet tissue" shading used by cells, proteins and particles alike.
// Wrap-lit diffuse, back-scatter at the silhouette, a fresnel rim and a gentle
// specular lobe. Output is linear HDR; bloom picks up the rim.
export const SHADE = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uFillColor;
uniform vec3 uBackColor;

// deep: colour light takes after scattering through the body (shadow side)
// mid:  lit surface colour; rim: thin translucent edge
vec3 tissueShade(vec3 N, vec3 V, vec3 deep, vec3 mid, vec3 rim, float fresPow, float rimAmt, float spec, float gloss) {
  vec3 L = normalize(uKeyDir);
  float ndl = dot(N, L);
  float wrap = clamp((ndl + 0.75) / 1.75, 0.0, 1.0);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, fresPow);
  float back = pow(clamp(dot(-V, L), 0.0, 1.0), 2.0) * pow(1.0 - ndv, 1.6);
  vec3 body = mix(deep, mid, wrap * wrap);
  body *= uKeyColor * (0.3 + 0.7 * wrap) + uFillColor;
  // thin edges let the rim colour through
  body = mix(body, rim * 0.55, fres * 0.45);
  vec3 H = normalize(L + V);
  float ndh = clamp(dot(N, H), 0.0, 1.0);
  float sp = (pow(ndh, gloss) * 0.6 + pow(ndh, gloss * 5.0) * 0.8) * spec;
  vec3 col = body;
  col += rim * fres * rimAmt;
  col += rim * back * uBackColor;
  col += uKeyColor * sp;
  return col;
}
`;

// Cell surface model. A unit-sphere direction `d` maps to a displaced point on
// a living membrane: slow undulation, microvilli, apoptotic blebs, contact
// flattening (immune synapse / bead docking), mitotic stretch and a pinch
// (cleavage furrow, or squeezing through an endothelial gap).
export const CELL_SHAPE = /* glsl */ `
uniform float uTime;
uniform vec3 uSeed;
uniform float uDisp;
uniform float uDispFreq;
uniform float uDispSpeed;
uniform float uVilli;
uniform float uVilliFreq;
uniform float uBleb;
uniform vec4 uContact0;
uniform vec4 uContact1;
uniform vec4 uContact2;
uniform vec4 uStretch;   // xyz axis, w = elongation
uniform vec4 uPinchAxis; // xyz axis, w = centre offset along axis
uniform vec3 uPinch;     // x = amount, y = width, z = min radius
uniform vec4 uPit;       // xyz dir, w = depth (endocytic pit)
uniform float uPitW;     // angular width of the pit

float softplusK(float x, float k) { return k * log(1.0 + exp(x / k)); }

float cellRadius(vec3 d) {
  vec3 q = d * uDispFreq + uSeed + vec3(0.0, uTime * uDispSpeed, uTime * uDispSpeed * 0.6);
  float r = 1.0 + uDisp * (snoise(q) * 0.68 + snoise(q * 2.1 + 5.3) * 0.32);
  if (uVilli > 0.0) {
    float v = snoise(d * uVilliFreq + uSeed * 1.9 + vec3(uTime * 0.03));
    float v2 = snoise(d * uVilliFreq * 2.3 - uSeed + vec3(uTime * 0.02));
    r += uVilli * (smoothstep(0.1, 0.9, v) * 0.75 + smoothstep(0.2, 0.9, v2) * 0.35);
  }
  if (uPit.w > 0.0) {
    float ang = acos(clamp(dot(d, uPit.xyz), -1.0, 1.0));
    float x = ang / uPitW;
    r -= uPit.w * exp(-x * x * 1.8);
    r += uPit.w * 0.22 * exp(-pow((x - 1.2) * 2.2, 2.0));
  }
  if (uBleb > 0.0) {
    float b = snoise(d * 2.3 + uSeed * 2.7 + vec3(0.0, uTime * 0.35, 0.0));
    float b2 = snoise(d * 4.1 + uSeed * 1.3 - vec3(uTime * 0.25));
    r += uBleb * (0.42 * smoothstep(0.2, 0.85, b) + 0.18 * smoothstep(0.35, 0.9, b2));
  }
  return r;
}

vec3 applyContact(vec3 p, vec4 c) {
  if (c.w > 1.9) return p;
  float h = dot(p, c.xyz);
  float e = softplusK(h - c.w, 0.045);
  return p - c.xyz * e;
}

vec3 cellSurface(vec3 d) {
  vec3 p = d * cellRadius(d);
  if (uStretch.w > 0.0) {
    p += uStretch.xyz * dot(p, uStretch.xyz) * uStretch.w;
  }
  if (uPinch.x > 0.0) {
    vec3 ax = uPinchAxis.xyz;
    float h = dot(p, ax) - uPinchAxis.w;
    vec3 radial = p - ax * dot(p, ax);
    float k = uPinch.x * exp(-(h * h) / (uPinch.y * uPinch.y));
    float len = length(radial);
    float target = mix(len, min(len, uPinch.z), k);
    radial *= target / max(len, 1e-4);
    // Volume goes somewhere: bulge a little away from the constriction.
    float bulge = 1.0 + 0.12 * uPinch.x * (1.0 - exp(-(h * h) / (4.0 * uPinch.y * uPinch.y)));
    p = ax * dot(p, ax) + radial * bulge;
  }
  p = applyContact(p, uContact0);
  p = applyContact(p, uContact1);
  p = applyContact(p, uContact2);
  return p;
}

void cellFrame(vec3 d, out vec3 P, out vec3 N) {
  vec3 up = abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(up, d));
  vec3 b = cross(d, t);
  const float e = 0.012;
  P = cellSurface(d);
  vec3 p1 = cellSurface(normalize(d + t * e));
  vec3 p2 = cellSurface(normalize(d + b * e));
  N = normalize(cross(p1 - P, p2 - P));
}
`;
