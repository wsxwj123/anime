// Small, dependency-free helpers shared by every shot.
// Everything that animates is a pure function of time, so these stay stateless.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const fract = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;

export const ease = {
  linear: (t) => t,
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// Eased progress of `t` through the window [a, b].
export const prog = (t, a, b, fn = ease.inOutCubic) => fn(invLerp(a, b, t));

// Opacity envelope: fades in over `fi` after t0 and out over `fo` before t1.
export function envelope(t, t0, t1, fi = 0.6, fo = 0.6) {
  if (t <= t0 || t >= t1) return 0;
  const a = fi > 0 ? smoothstep(t0, t0 + fi, t) : 1;
  const b = fo > 0 ? 1 - smoothstep(t1 - fo, t1, t) : 1;
  return Math.min(a, b);
}

// Deterministic PRNG so every run (and every captured frame) is identical.
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.sign = () => (next() < 0.5 ? -1 : 1);
  next.gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  // Uniform direction on the unit sphere.
  next.dir = () => {
    const z = next() * 2 - 1;
    const p = next() * TAU;
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(p), z, r * Math.sin(p)];
  };
  return next;
}

// Evenly spread points on a sphere (Fibonacci lattice).
export function fibonacciSphere(n, jitter = 0, rand = null) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    let y = 1 - ((i + 0.5) / n) * 2;
    let r = Math.sqrt(1 - y * y);
    let th = golden * i;
    if (jitter && rand) {
      th += (rand() - 0.5) * jitter;
      y = clamp(y + (rand() - 0.5) * jitter * 0.3, -1, 1);
      r = Math.sqrt(1 - y * y);
    }
    out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return out;
}

// Smooth pseudo-random wobble in [-1, 1]; cheap sum of incommensurate sines.
export function wobble(t, seed = 0) {
  return (
    0.5 * Math.sin(t * 0.73 + seed * 1.7) +
    0.3 * Math.sin(t * 1.31 + seed * 3.1 + 1.3) +
    0.2 * Math.sin(t * 2.17 + seed * 5.3 + 2.1)
  );
}

// Static organic displacement for baked shapes (proteins, beads, blobs):
// a handful of random directional waves. Deterministic per seed.
export function makeWaves(seed, count = 7, freq = [1.5, 4.0], amp = 0.08) {
  const r = rng(seed);
  const waves = [];
  for (let i = 0; i < count; i++) {
    const d = r.dir();
    waves.push({
      d,
      f: r.range(freq[0], freq[1]),
      p: r.range(0, TAU),
      a: (amp * r.range(0.4, 1.0)) / Math.sqrt(count / 3),
    });
  }
  return (x, y, z) => {
    let s = 0;
    for (const w of waves) s += w.a * Math.sin((x * w.d[0] + y * w.d[1] + z * w.d[2]) * w.f + w.p);
    return s;
  };
}

export function formatTime(s) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

// ∫ of smoothstep(a, b, τ) dτ from a to t — lets rotation speeds ramp
// smoothly while angles stay an exact function of time.
export function smoothRampIntegral(t, a, b) {
  if (t <= a) return 0;
  const w = b - a;
  if (t >= b) return w * 0.5 + (t - b);
  const x = (t - a) / w;
  return w * (x * x * x - (x * x * x * x) / 2);
}

// Angle travelled when speed ramps from w0 to w1 over [a, b].
export function rampAngle(t, w0, w1, a, b) {
  return w0 * t + (w1 - w0) * smoothRampIntegral(t, a, b);
}
