// Generative score: ambient pads, glassy bells and restrained sound design,
// all scheduled from the film's own timeline. The same score plays live in
// the page and renders offline (OfflineAudioContext) for the video export.
import { rng } from './engine/util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Chord voicings (MIDI): bass + pad notes
const CH = {
  Dmaj9: { bass: 38, pad: [50, 57, 61, 64, 66] },
  Bm11: { bass: 35, pad: [54, 57, 62, 64] },
  Gmaj9: { bass: 31, pad: [54, 57, 59, 62] },
  Aadd9: { bass: 33, pad: [52, 57, 59, 61] },
  Bm9: { bass: 35, pad: [50, 54, 57, 61] },
  Gmaj7: { bass: 31, pad: [50, 54, 59, 62] },
  Em9: { bass: 40, pad: [55, 59, 62, 66] },
  Fsm7: { bass: 42, pad: [52, 57, 61, 64] },
  Cmaj7s11: { bass: 36, pad: [52, 55, 59, 66] },
  Am9: { bass: 33, pad: [48, 52, 55, 59] },
  Bsus: { bass: 35, pad: [52, 54, 57, 61] },
  B7: { bass: 35, pad: [51, 54, 57, 63] },
};

export function buildScore(tl) {
  const S = Object.fromEntries(tl.shots.map((s) => [s.id, s.start]));
  const ev = [];
  const r = rng(4242);
  const chord = (name, t0, t1, bright = 0.4, vol = 1) => {
    const c = CH[name];
    ev.push({ type: 'pad', t: t0, dur: t1 - t0, notes: c.pad, bright, vol });
    ev.push({ type: 'bass', t: t0, dur: t1 - t0, midi: c.bass, vol: 0.9 * vol });
    return c;
  };
  const prog = [];
  const seq = (list) => {
    for (const [name, t0, t1, bright, vol] of list) prog.push({ c: chord(name, t0, t1, bright, vol), t0, t1 });
  };
  const s = (id, dt = 0) => S[id] + dt;

  // ---- harmony
  seq([
    ['Dmaj9', 0, s('collect'), 0.25, 0.9],
    ['Dmaj9', s('collect'), s('collect', 5.5), 0.35],
    ['Bm11', s('collect', 5.5), s('collect', 11), 0.35],
    ['Gmaj9', s('collect', 11), s('activate', 3.5), 0.35],
    ['Aadd9', s('activate', 3.5), s('activate', 8.5), 0.45],
    ['Dmaj9', s('activate', 8.5), s('transduceA', 3.5), 0.45],
    ['Bm11', s('transduceA', 3.5), s('transduceB', 2.5), 0.4],
    ['Gmaj9', s('transduceB', 2.5), s('transduceC', 2.5), 0.45],
    ['Aadd9', s('transduceC', 2.5), s('car'), 0.5],
    ['Gmaj9', s('car'), s('car', 7.5), 0.45],
    ['Aadd9', s('car', 7.5), s('expand'), 0.5],
    ['Dmaj9', s('expand'), s('expand', 6), 0.5],
    ['Bm11', s('expand', 6), s('expand', 9), 0.55],
    ['Gmaj9', s('expand', 9), s('infuseBag'), 0.6],
    ['Bm9', s('infuseBag'), s('infuseVein'), 0.35],
    ['Gmaj7', s('infuseVein'), s('vessel'), 0.4],
    ['Em9', s('vessel'), s('extravasate'), 0.4],
    ['Fsm7', s('extravasate'), s('extravasate', 4.5), 0.4],
    ['Bm9', s('extravasate', 4.5), s('approach'), 0.45],
    ['Em9', s('approach'), s('binding'), 0.4],
    ['Cmaj7s11', s('binding'), s('synapse'), 0.5],
    ['Am9', s('synapse'), s('synapse', 5), 0.5],
    ['Bsus', s('synapse', 5), s('perforin'), 0.55],
    ['Em9', s('perforin'), s('perforin', 4), 0.5],
    ['Cmaj7s11', s('perforin', 4), s('apoptosis'), 0.55],
    ['Bsus', s('apoptosis'), s('apoptosis', 3.6), 0.55],
    ['B7', s('apoptosis', 3.6), s('apoptosis', 5.8), 0.6],
    ['Gmaj9', s('apoptosis', 5.8), s('serial'), 0.45],
    ['Dmaj9', s('serial'), s('serial', 6), 0.55],
    ['Aadd9', s('serial', 6), s('memory'), 0.6],
    ['Gmaj9', s('memory'), s('memory', 5.5), 0.4],
    ['Dmaj9', s('memory', 5.5), tl.total + 0.5, 0.35, 0.95],
  ]);

  // ---- glass bells over the harmony, denser where the story is busy
  const density = (t) => {
    if (t < s('collect')) return 0.12;
    if (t < s('infuseBag')) return 0.4;
    if (t < s('approach')) return 0.18;
    if (t < s('serial')) return 0.42;
    if (t < s('memory')) return 0.6;
    return 0.25;
  };
  const step = 60 / 76 / 2;
  for (let t = 1.2; t < tl.total - 3; t += step) {
    if (r() > density(t)) continue;
    const pc = prog.find((p) => t >= p.t0 && t < p.t1);
    if (!pc) continue;
    const notes = pc.c.pad;
    const n = notes[Math.floor(r() * notes.length)] + (r() < 0.6 ? 24 : 12);
    ev.push({ type: 'bell', t, midi: n, vol: 0.18 + r() * 0.16, pan: r() * 1.6 - 0.8, decay: 1.6 + r() * 1.6 });
  }

  // ---- sound design, anchored to on-screen events
  const bell = (t, midi, vol = 0.45, pan = 0, decay = 2.4) => ev.push({ type: 'bell', t, midi, vol, pan, decay });
  const whoosh = (t, dur = 1.8, vol = 0.35, f0 = 300, f1 = 2400) => ev.push({ type: 'whoosh', t, dur, vol, f0, f1 });
  ev.push({ type: 'boom', t: 1.3, vol: 0.32 });
  bell(1.9, 81, 0.35, -0.3, 3.6);
  bell(2.3, 88, 0.28, 0.3, 3.6);
  for (const ch of tl.chapters.slice(1)) whoosh(ch.start - 0.6, 1.9, 0.22);
  // centrifuge spin-up
  ev.push({ type: 'hum', t: s('collect', 0.5), dur: 11.5, vol: 0.14, f0: 42, f1: 96 });
  bell(s('collect', 8.6), 76, 0.4, 0.2, 3.0);
  // beads dock
  [2.4, 3.2, 4.0].forEach((d, i) => bell(s('activate', d), [69, 73, 76][i], 0.4, [-0.4, 0.4, 0][i], 2.2));
  ev.push({ type: 'swell', t: s('activate', 4.2), dur: 4.5, vol: 0.22, f0: 400, f1: 3000 });
  // virus binds and is taken in
  bell(s('transduceA', 2.6), 83, 0.35, 0.3, 2.2);
  ev.push({ type: 'gulp', t: s('transduceA', 5.3), vol: 0.35 });
  // uncoating, reverse transcription run, integration
  ev.push({ type: 'sparkle', t: s('transduceB', 2.2), dur: 0.9, vol: 0.26, seed: 3 });
  for (let i = 0; i < 8; i++) bell(s('transduceB', 2.9 + i * 0.22), [74, 76, 78, 81, 83, 85, 86, 88][i], 0.2, -0.5 + i * 0.14, 1.4);
  bell(s('transduceC', 3.4), 74, 0.42, -0.35, 3.2);
  bell(s('transduceC', 3.7), 81, 0.42, 0.35, 3.2);
  ev.push({ type: 'sparkle', t: s('transduceC', 4.8), dur: 2.0, vol: 0.18, seed: 5 });
  // CAR domains assemble, one note each
  [1.1, 2.6, 4.0, 5.4, 6.7].forEach((d, i) => bell(s('car', d), [74, 76, 78, 81, 83][i], 0.36, -0.4 + i * 0.2, 2.6));
  for (let k = 0; k < 3; k++) [0.22, 0.55, 0.86].forEach((u, i) => bell(s('car', 9.2 + k * 2.4 + u * 2.4), 90 + i * 2, 0.12, 0.2, 0.8));
  // divisions and the culture blooming
  [2.2, 4.0, 5.5, 6.7].forEach((d, i) => bell(s('expand', d), [79, 81, 83, 86][i], 0.3, i % 2 ? 0.4 : -0.4, 1.8));
  ev.push({ type: 'sparkle', t: s('expand', 7.0), dur: 4.0, vol: 0.2, seed: 7 });
  ev.push({ type: 'swell', t: s('expand', 7.0), dur: 4.6, vol: 0.18, f0: 600, f1: 5000 });
  bell(s('expand', 10.4), 93, 0.2, 0, 4.0);
  // drip
  for (let k = 1; k < 6; k++) ev.push({ type: 'plip', t: s('infuseBag', k / 0.9), vol: 0.12 });
  // heartbeat through the circulation
  for (let t = s('infuseVein', 0.5); t < s('approach', -0.5); t += 60 / 62) {
    const fade = Math.min(1, (t - s('infuseVein', 0.5)) / 3, (s('approach', -0.5) - t) / 3);
    ev.push({ type: 'thump', t, vol: 0.32 * fade });
    ev.push({ type: 'thump', t: t + 0.26, vol: 0.2 * fade });
  }
  ev.push({ type: 'flow', t: s('vessel'), dur: 7.5, vol: 0.12 });
  ev.push({ type: 'swell', t: s('extravasate', 3.4), dur: 3.2, vol: 0.16, f0: 200, f1: 1200 });
  bell(s('extravasate', 6.6), 78, 0.3, 0.2, 2.6);
  // contact and binding
  ev.push({ type: 'boom', t: s('approach', 3.3), vol: 0.25 });
  [0.25, 0.1, 0.0, 0.18, 0.32, 0.4, 0.06, 0.28].forEach((lag, i) => bell(s('binding', 2.2 + lag * 7), [76, 79, 83, 86, 88, 91, 81, 84][i], 0.3, -0.6 + (i % 5) * 0.3, 2.4));
  // synapse
  for (let i = 0; i < 18; i++) bell(s('synapse', 1.2 + i * 0.34), 88 + (i % 4) * 2, 0.1, (i % 2 ? 0.3 : -0.3), 0.7);
  ev.push({ type: 'sparkle', t: s('synapse', 5.6), dur: 3.8, vol: 0.16, seed: 11 });
  // perforin & granzyme
  ev.push({ type: 'whoosh', t: s('perforin', 0.6), dur: 1.6, vol: 0.2, f0: 800, f1: 3000 });
  bell(s('perforin', 1.1), 83, 0.3, 0, 2.4);
  for (let i = 0; i < 16; i++) bell(s('perforin', 4.2 + i * 0.07 + 0.05), 95 + (i % 3), 0.07, -0.7 + i * 0.09, 0.5);
  ev.push({ type: 'swell', t: s('perforin', 4.3), dur: 1.8, vol: 0.2, f0: 150, f1: 900 });
  ev.push({ type: 'gulp', t: s('perforin', 5.8), vol: 0.22 });
  // apoptosis
  ev.push({ type: 'swell', t: s('apoptosis', 0.3), dur: 5.3, vol: 0.2, f0: 120, f1: 1400 });
  ev.push({ type: 'boom', t: s('apoptosis', 5.8), vol: 0.38 });
  ev.push({ type: 'sparkle', t: s('apoptosis', 5.8), dur: 1.4, vol: 0.28, seed: 13 });
  // serial killing: one soft impact per tumour cell
  [3.1, 3.4, 3.6, 6.4, 7.0, 8.6, 10.0].forEach((d, i) => {
    ev.push({ type: 'boom', t: s('serial', d), vol: 0.22 });
    bell(s('serial', d + 0.05), [83, 86, 88, 90, 93, 95, 98][i], 0.18, -0.5 + i * 0.16, 1.6);
  });
  // coda
  bell(s('memory', 6.6), 74, 0.32, -0.2, 5.0);
  bell(s('memory', 7.1), 81, 0.28, 0.2, 5.0);
  bell(s('memory', 7.6), 86, 0.22, 0, 5.5);
  return ev;
}

function makeNoise(ctx, seconds = 2) {
  const r = rng(99);
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return b;
}

function makeIR(ctx, seconds = 3.4) {
  const r = rng(7);
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const k = 0.55 + 0.4 * x; // darker as it decays
      lp = lp * k + (r() * 2 - 1) * (1 - k);
      d[i] = lp * Math.pow(1 - x, 2.2) * (i < 64 ? i / 64 : 1) * 2.2;
    }
  }
  return b;
}

// Builds the mixing graph and schedules every event from `from` seconds of
// film time; film time `from` plays at context time `at`.
function schedule(ctx, out, events, from, at, total) {
  const sources = [];
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  comp.attack.value = 0.02;
  comp.release.value = 0.4;
  master.connect(comp).connect(out);
  const verb = ctx.createConvolver();
  verb.buffer = makeIR(ctx);
  const verbGain = ctx.createGain();
  verbGain.gain.value = 0.55;
  verb.connect(verbGain).connect(master);
  const noise = makeNoise(ctx);
  const T = (t) => at + (t - from);
  // automation times may fall before "now" when playback starts mid-film
  const cl = (x) => Math.max(ctx.currentTime, x);

  const env = (g, t0, a, sustainEnd, rel, peak) => {
    g.gain.setValueAtTime(0, cl(Math.max(0, t0)));
    g.gain.linearRampToValueAtTime(peak, cl(t0 + a));
    g.gain.setValueAtTime(peak, cl(Math.max(t0 + a, sustainEnd)));
    g.gain.linearRampToValueAtTime(0, cl(Math.max(t0 + a, sustainEnd) + rel));
  };
  const route = (node, dry, wet, pan = 0) => {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    const d = ctx.createGain();
    d.gain.value = dry;
    const w = ctx.createGain();
    w.gain.value = wet;
    p.connect(d).connect(master);
    p.connect(w).connect(verb);
  };
  const osc = (type, f, t0, t1) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(Math.max(ctx.currentTime, t0));
    o.stop(Math.max(ctx.currentTime + 0.01, t1));
    sources.push(o);
    return o;
  };
  const noiseSrc = (t0, t1) => {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    n.start(Math.max(ctx.currentTime, t0), Math.abs(t0 * 7.3) % 1.5);
    n.stop(Math.max(ctx.currentTime + 0.01, t1));
    sources.push(n);
    return n;
  };

  for (const e of events) {
    const len = e.dur ?? 3;
    if (e.t + len + 6 < from || e.t > total + 1) continue;
    const t0 = T(e.t);
    if (e.type === 'pad') {
      const rel = 3.2;
      const end = t0 + e.dur;
      e.notes.forEach((m, i) => {
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 380 + 1500 * e.bright;
        lp.Q.value = 0.4;
        for (const det of [-6, 6]) {
          const o = osc('sawtooth', mtof(m), t0, end + rel + 0.1);
          o.detune.value = det + (i - 2) * 1.5;
          o.connect(lp);
        }
        lp.connect(g);
        env(g, t0, Math.min(2.6, e.dur * 0.4), end, rel, (0.028 * e.vol) / Math.sqrt(e.notes.length / 4));
        route(g, 0.55, 0.9, ((i / (e.notes.length - 1)) * 2 - 1) * 0.55);
      });
    } else if (e.type === 'bass') {
      const g = ctx.createGain();
      const end = t0 + e.dur;
      const o = osc('sine', mtof(e.midi), t0, end + 3);
      const o2 = osc('triangle', mtof(e.midi + 12), t0, end + 3);
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o.connect(g);
      o2.connect(g2).connect(g);
      env(g, t0, 1.8, end, 2.5, 0.09 * e.vol);
      route(g, 0.9, 0.2, 0);
    } else if (e.type === 'bell') {
      const f = mtof(e.midi);
      const g = ctx.createGain();
      [
        [1, 1],
        [2.0, 0.22],
        [3.01, 0.08],
      ].forEach(([k, a]) => {
        const o = osc('sine', f * k, t0, t0 + e.decay + 0.2);
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(g);
      });
      g.gain.setValueAtTime(0, cl(Math.max(0, t0)));
      g.gain.linearRampToValueAtTime(0.12 * e.vol, cl(t0 + 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, cl(t0 + e.decay));
      route(g, 0.45, 1.0, e.pan);
    } else if (e.type === 'whoosh' || e.type === 'flow') {
      const n = noiseSrc(t0, t0 + e.dur + 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = e.type === 'flow' ? 0.6 : 1.2;
      bp.frequency.setValueAtTime(e.f0 ?? 250, cl(t0));
      bp.frequency.exponentialRampToValueAtTime(e.f1 ?? 700, cl(t0 + e.dur));
      const g = ctx.createGain();
      n.connect(bp).connect(g);
      if (e.type === 'flow') env(g, t0, 1.5, t0 + e.dur - 1.5, 1.4, 0.1 * e.vol);
      else env(g, t0, e.dur * 0.45, t0 + e.dur * 0.5, e.dur * 0.5, 0.1 * e.vol);
      route(g, 0.6, 0.5, 0);
    } else if (e.type === 'swell') {
      const n = noiseSrc(t0, t0 + e.dur + 0.4);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2.5;
      bp.frequency.setValueAtTime(e.f0, cl(t0));
      bp.frequency.exponentialRampToValueAtTime(e.f1, cl(t0 + e.dur));
      const g = ctx.createGain();
      n.connect(bp).connect(g);
      g.gain.setValueAtTime(0, cl(Math.max(0, t0)));
      g.gain.linearRampToValueAtTime(0.07 * e.vol, cl(t0 + e.dur * 0.85));
      g.gain.linearRampToValueAtTime(0, cl(t0 + e.dur + 0.35));
      route(g, 0.4, 0.8, 0);
    } else if (e.type === 'boom') {
      const o = osc('sine', 90, t0, t0 + 2.6);
      o.frequency.setValueAtTime(92, cl(t0));
      o.frequency.exponentialRampToValueAtTime(36, cl(t0 + 1.4));
      const g = ctx.createGain();
      o.connect(g);
      g.gain.setValueAtTime(0, cl(Math.max(0, t0)));
      g.gain.linearRampToValueAtTime(0.5 * e.vol, cl(t0 + 0.02));
      g.gain.exponentialRampToValueAtTime(0.0001, cl(t0 + 2.4));
      route(g, 0.9, 0.35, 0);
      const n = noiseSrc(t0, t0 + 1.2);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const ng = ctx.createGain();
      n.connect(lp).connect(ng);
      ng.gain.setValueAtTime(0, cl(Math.max(0, t0)));
      ng.gain.linearRampToValueAtTime(0.12 * e.vol, cl(t0 + 0.01));
      ng.gain.exponentialRampToValueAtTime(0.0001, cl(t0 + 1.0));
      route(ng, 0.6, 0.6, 0);
    } else if (e.type === 'thump') {
      const o = osc('sine', 62, t0, t0 + 0.5);
      o.frequency.setValueAtTime(64, cl(t0));
      o.frequency.exponentialRampToValueAtTime(42, cl(t0 + 0.22));
      const g = ctx.createGain();
      o.connect(g);
      g.gain.setValueAtTime(0, cl(Math.max(0, t0)));
      g.gain.linearRampToValueAtTime(0.5 * e.vol, cl(t0 + 0.012));
      g.gain.exponentialRampToValueAtTime(0.0001, cl(t0 + 0.34));
      route(g, 1.0, 0.1, 0);
    } else if (e.type === 'plip') {
      const o = osc('sine', 1500, t0, t0 + 0.3);
      o.frequency.setValueAtTime(1500, cl(t0));
      o.frequency.exponentialRampToValueAtTime(640, cl(t0 + 0.07));
      const g = ctx.createGain();
      o.connect(g);
      g.gain.setValueAtTime(0, cl(Math.max(0, t0)));
      g.gain.linearRampToValueAtTime(0.1 * e.vol, cl(t0 + 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, cl(t0 + 0.2));
      route(g, 0.5, 0.8, 0.15);
    } else if (e.type === 'gulp') {
      const o = osc('sine', 220, t0, t0 + 0.8);
      o.frequency.setValueAtTime(260, cl(t0));
      o.frequency.exponentialRampToValueAtTime(90, cl(t0 + 0.45));
      const g = ctx.createGain();
      o.connect(g);
      g.gain.setValueAtTime(0, cl(Math.max(0, t0)));
      g.gain.linearRampToValueAtTime(0.22 * e.vol, cl(t0 + 0.03));
      g.gain.exponentialRampToValueAtTime(0.0001, cl(t0 + 0.6));
      route(g, 0.6, 0.6, 0);
    } else if (e.type === 'hum') {
      const o = osc('sawtooth', e.f0, t0, t0 + e.dur + 1);
      o.frequency.setValueAtTime(e.f0, cl(t0));
      o.frequency.linearRampToValueAtTime(e.f1, cl(t0 + e.dur * 0.55));
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const g = ctx.createGain();
      o.connect(lp).connect(g);
      env(g, t0, 2.5, t0 + e.dur - 2.5, 2.4, 0.08 * e.vol);
      route(g, 0.7, 0.3, 0);
    } else if (e.type === 'sparkle') {
      const rr = rng(e.seed || 1);
      const n = Math.round(e.dur * 9);
      for (let i = 0; i < n; i++) {
        const tt = t0 + rr() * e.dur;
        const f = mtof(88 + Math.floor(rr() * 14));
        const o = osc('sine', f, tt, tt + 0.9);
        const g = ctx.createGain();
        o.connect(g);
        g.gain.setValueAtTime(0, cl(Math.max(0, tt)));
        g.gain.linearRampToValueAtTime(0.03 * e.vol * (0.5 + rr()), cl(tt + 0.004));
        g.gain.exponentialRampToValueAtTime(0.0001, cl(tt + 0.5 + rr() * 0.4));
        route(g, 0.3, 1.0, rr() * 1.6 - 0.8);
      }
    }
  }
  // gentle fade at the very end of the film
  master.gain.setValueAtTime(0.9, cl(Math.max(0, T(total - 3.5))));
  master.gain.linearRampToValueAtTime(0.0001, cl(T(total)));
  return {
    stop() {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, cl(now));
      master.gain.linearRampToValueAtTime(0, cl(now + 0.12));
      setTimeout(() => {
        for (const s of sources) {
          try {
            s.stop();
          } catch (e) {
            /* already stopped */
          }
        }
        master.disconnect();
        verb.disconnect();
      }, 200);
    },
  };
}

export class Soundtrack {
  constructor(tl) {
    this.tl = tl;
    this.events = buildScore(tl);
    this.muted = false;
    this.ctx = null;
    this.session = null;
    this.out = null;
  }
  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 1;
    this.out.connect(this.ctx.destination);
    return true;
  }
  play(T) {
    if (!this.ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.session) this.session.stop();
    this.session = schedule(this.ctx, this.out, this.events, T, this.ctx.currentTime + 0.06, this.tl.total);
  }
  pause() {
    if (this.session) this.session.stop();
    this.session = null;
  }
  setMuted(m) {
    this.muted = m;
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }
  // Renders the full score to 16-bit stereo WAV bytes.
  async renderOffline(sampleRate = 48000) {
    const total = this.tl.total;
    const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * total), sampleRate);
    schedule(ctx, ctx.destination, this.events, 0, 0, total);
    const buf = await ctx.startRendering();
    return encodeWav(buf);
  }
}

function encodeWav(buf) {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  let peak = 0;
  for (let c = 0; c < ch; c++) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[c][i]));
  const norm = peak > 0 ? Math.min(4, 0.89 / peak) : 1;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i] * norm));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out.buffer);
}
