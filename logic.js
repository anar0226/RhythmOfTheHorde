export const TRACK = { file: 'The Hu- Wolf Totem.mp3', title: 'THE HU - WOLF TOTEM' };
export const BPM = 86, BEAT = 60 / BPM;
export const DOWNBEAT = 0.1 + 3 * BEAT;
export const PERFECT = 0.07, GOOD = 0.16;

export const SWING_SPEED = 4.5, SWING_RESET = 2;
export const SQUAT_IN = 0.5, SQUAT_OUT = 0.65;

export const PHRASES = [
  '*.......*.......*.......*.......',
  'a.......*.......a.......s.......',
  'a...a...*.......s...a...*.......',
  'a.*.a.*.s.......a.*.a.*.s.......',
  'aaaaaaaa........aaaaaaaa........',
  '*.a.*.s.*.a.*.s.*...a...s...*...',
  'a.a.s...a.a.s...*.*.*...s.s.a...',
  'asasasas........*a*a*a*a........',
  'a.*.a.*.s.s.*...a.*.a.*.aaaaaaaa',
  '*...*...*...*...s.......*.......',
  'a.*.a.*.s.s.a.a.*.*.*.*.s.......',
];
const FIRST_BAR = 3;
const SONG = [
  0, 0, 1, 2,
  3, 5, 2, 6, 3, 5, 4,
  9,
  6, 8, 7, 5,
  0, 9,
  8, 6, 4, 10,
];
const TYPES = { a: 'arrow', s: 'shield', '*': 'strike' };

export function buildChart() {
  const notes = [];
  SONG.forEach((p, i) => [...PHRASES[p]].forEach((c, j) => {
    if (c !== '.') notes.push({ t: DOWNBEAT + (((FIRST_BAR + i * 4) * 8 + j) * BEAT) / 2, type: TYPES[c], done: false });
  }));
  notes.forEach((n, i) => (n.dense = notes[i + 1]?.t - n.t < BEAT * 0.6 || n.t - notes[i - 1]?.t < BEAT * 0.6));
  return notes;
}

export function judge(notes, t) {
  let best = null;
  for (const n of notes) {
    if (!n.done && Math.abs(n.t - t) <= GOOD && (!best || Math.abs(n.t - t) < Math.abs(best.t - t))) best = n;
  }
  if (best) {
    best.done = true;
    best.grade = Math.abs(best.t - t) <= PERFECT ? 'perfect' : 'good';
  }
  return best;
}

const SHOULDERS = [11, 12], WRISTS = [15, 16], HIPS = [23, 24], KNEES = [25, 26];
const mid = (lm, [a, b]) => ({ x: (lm[a].x + lm[b].x) / 2, y: (lm[a].y + lm[b].y) / 2 });

export function squatDepth(lm) {
  const sh = mid(lm, SHOULDERS), hip = mid(lm, HIPS), knee = mid(lm, KNEES), torso = hip.y - sh.y;
  return knee.y < 1 && torso > 0.03 ? (knee.y - hip.y) / torso : null;
}

export function swingDetector() {
  let prev = null, armed = true;
  const detect = (lm, seconds, aspect = 1) => {
    const sh = mid(lm, SHOULDERS), hip = mid(lm, HIPS);
    const torso = Math.hypot((hip.x - sh.x) * aspect, hip.y - sh.y) || 1;
    const wrists = WRISTS.map(i => ({ x: ((lm[i].x - hip.x) * aspect) / torso, y: (lm[i].y - hip.y) / torso }));
    let fired = false;
    if (prev && seconds > prev.seconds) {
      const moved = Math.max(...wrists.map((w, k) => Math.hypot(w.x - prev.wrists[k].x, w.y - prev.wrists[k].y)));
      const speed = moved / (seconds - prev.seconds);
      if (speed < 40) {
        detect.speed = speed;
        if (armed && speed > SWING_SPEED) {
          fired = true;
          armed = false;
        } else if (speed < SWING_RESET) armed = true;
      }
    }
    prev = { wrists, seconds };
    return fired;
  };
  detect.speed = 0;
  return detect;
}
