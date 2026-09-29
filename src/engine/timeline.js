import { smoothstep, ease } from './util.js';

// Lays shots end to end, grouped by chapter. A shot's `transition` describes how
// it enters: { type: 'cross' | 'dip' | 'cut', dur, mode }. Crossfades borrow the
// first `dur` seconds of the incoming shot while the outgoing shot keeps running.
export function buildTimeline(chapters, shots) {
  let t = 0;
  const list = [];
  const spans = [];
  chapters.forEach((ch, ci) => {
    const start = t;
    for (const id of ch.shots) {
      const s = shots[id];
      if (!s) throw new Error(`missing shot ${id}`);
      s.id = id;
      s.start = t;
      s.end = t + s.duration;
      s.chapterIndex = ci;
      list.push(s);
      t = s.end;
    }
    spans.push({ ...ch, index: ci, start, end: t });
  });
  return { shots: list, chapters: spans, total: t };
}

const GLOBAL_IN = 1.2;
const GLOBAL_OUT = 2.0;

// Which shots are on screen at global time T, and how they mix.
export function resolve(tl, T) {
  const { shots, total } = tl;
  let i = shots.findIndex((s) => T < s.end);
  if (i < 0) i = shots.length - 1;
  const cur = shots[i];
  const lt = T - cur.start;
  const out = { cur, lt, a: cur, at: lt, b: null, bt: 0, mix: 0, mode: 0, fade: 1 };

  const tr = cur.transition || { type: 'cross', dur: 1.0 };
  const prev = shots[i - 1];
  if (prev && tr.type === 'cross' && lt < tr.dur) {
    out.a = prev;
    out.at = T - prev.start;
    out.b = cur;
    out.bt = lt;
    out.mix = ease.inOutSine(lt / tr.dur);
    out.mode = tr.mode ?? 0;
  }
  if (prev && tr.type === 'dip' && lt < tr.dur / 2) {
    out.fade *= smoothstep(0, tr.dur / 2, lt);
  }
  const next = shots[i + 1];
  if (next) {
    const ntr = next.transition || { type: 'cross', dur: 1.0 };
    if (ntr.type === 'dip' && cur.end - T < ntr.dur / 2) {
      out.fade *= 1 - smoothstep(cur.end - ntr.dur / 2, cur.end, T);
    }
  }
  out.fade *= smoothstep(0, GLOBAL_IN, T) * (1 - smoothstep(total - GLOBAL_OUT, total, T));
  return out;
}

export function chapterAt(tl, T) {
  const cs = tl.chapters;
  for (let i = 0; i < cs.length; i++) if (T < cs[i].end) return cs[i];
  return cs[cs.length - 1];
}
