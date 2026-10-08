import { KHAR_KHULZ, WOLF_TOTEM } from './charts.js';

export const PERFECT = 0.07, GOOD = 0.16;

export const SWING_SPEED = 6, SWING_TRAVEL = 0.9;
export const SQUAT_IN = 13, SQUAT_OUT = 7;

// The tutorial plays over a drum loop, teaching one thing at a time. Each lesson starts at its bar; its
// text has a keyboard and a webcam version. Misses cost no health here.
const TUTORIAL = {
  bpm: 90, downbeat: 2, firstBar: 1, practice: true,
  chart: [
    '........', '........',
    '*.......', '........', '*.......', '........', '*...*...', '........',
    'a...*...', '........', 'a...*...', '........', 'a.a.*...', '........',
    's...*...', '........', 'a.s.*...', '........', 'a.s.*...', '........',
    '........', 'aaaaaaaa', '*.......', '........', 'aaaaaaaa', '*.......', '........',
    'a...s.*.', '..a.s.*.', 'a.s.*...', '*...*...', '........', '........',
  ],
  lessons: [
    { bar: 1, title: 'THE TRACK', keys: 'Notes slide along the bottom track. Act when one reaches the star.', cam: 'Notes slide along the bottom track. Act when one reaches the star.' },
    { bar: 3, title: 'CUT DOWN THE CHARGE', keys: 'A rider charges in. Press Space as he reaches you, on the beat.', cam: 'A rider charges in. Chop your arm down as he reaches you, on the beat.' },
    { bar: 9, title: 'SPEARS', keys: 'From far out, riders throw spears. Slash each one as it reaches you, then the rider.', cam: 'From far out, riders throw spears. Chop each one as it reaches you, then the rider.' },
    { bar: 15, title: 'SHIELDS', keys: 'Closer in, they hurl shields. Smash them the same way.', cam: 'Closer in, they hurl shields. Smash them the same way.' },
    { bar: 21, title: 'SQUAT TO SLOW TIME', keys: 'A volley is too fast to slash. Hold S to slow time, release when it passes.', cam: 'A volley is too fast to slash. Squat and hold to slow time, stand up when it passes.' },
    { bar: 28, title: 'RIDE', keys: 'Now all together. Keep your combo going.', cam: 'Now all together. Keep your combo going.' },
    { bar: 33, title: 'READY FOR BATTLE', keys: 'Tutorial complete. Pick a song from the menu with Esc.', cam: 'Tutorial complete. Pick a song from the menu with Esc.' },
  ],
};

export const LEVELS = {
  tutorial: { title: 'TUTORIAL', scene: 'steppe', ...TUTORIAL },
  wolf: { title: 'THE HU - WOLF TOTEM', file: 'The Hu- Wolf Totem.mp3', scene: 'steppe', ...WOLF_TOTEM },
  khar: { title: 'UUHAI - KHAR KHULZ', file: 'Uuhai - Khar Khulz.mp3', scene: 'night', ...KHAR_KHULZ },
};

// Beat numbers (beat 0 is a downbeat, so bars start every 4) to song seconds and back. A steady song
// has a bpm and downbeat; one played with a drifting tempo has its measured beat times.
export function beatMap({ bpm, downbeat, beats }) {
  if (!beats) {
    const len = 60 / bpm;
    return { at: b => downbeat + b * len, of: t => (t - downbeat) / len, len: () => len };
  }
  const n = beats.length, first = beats[1] - beats[0], last = beats[n - 1] - beats[n - 2];
  const at = b => {
    if (b <= 0) return beats[0] + b * first;
    if (b >= n - 1) return beats[n - 1] + (b - n + 1) * last;
    const i = Math.floor(b);
    return beats[i] + (b - i) * (beats[i + 1] - beats[i]);
  };
  const of = t => {
    if (t <= beats[0]) return (t - beats[0]) / first;
    if (t >= beats[n - 1]) return n - 1 + (t - beats[n - 1]) / last;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) beats[(lo + hi) >> 1] <= t ? (lo = (lo + hi) >> 1) : (hi = (lo + hi) >> 1);
    return lo + (t - beats[lo]) / (beats[hi] - beats[lo]);
  };
  return { at, of, len: t => at(Math.floor(of(t)) + 1) - at(Math.floor(of(t))) };
}

const TYPES = { a: 'arrow', s: 'shield', '*': 'strike' };

export function buildChart(level) {
  const beat = beatMap(level), notes = [];
  level.chart.forEach((bar, i) => [...bar].forEach((c, j) => {
    if (c !== '.') notes.push({ t: beat.at((level.firstBar + i) * 4 + j / 2), type: TYPES[c], done: false });
  }));
  const close = (a, b) => b && Math.abs(b.t - a.t) < 0.6 * beat.len(a.t);
  notes.forEach((n, i) => (n.dense = close(n, notes[i + 1]) || close(n, notes[i - 1])));
  return notes;
}

// Every note belongs to a horseman: his charge (a strike) and the spears and shields he throws on the way in.
export function planRaids(notes) {
  const raids = [];
  let throws = [];
  for (const n of notes) {
    if (n.type !== 'strike') throws.push(n);
    else raids.push({ notes: [...throws, n], strike: n }), (throws = []);
  }
  for (const r of raids) for (const n of r.notes) n.raid = r;
  return raids;
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
const mid = (lm, [a, b]) => ({ x: (lm[a].x + lm[b].x) / 2, y: (lm[a].y + lm[b].y) / 2, z: (lm[a].z + lm[b].z) / 2 });
const follow = (tau, dt) => 1 - Math.exp(-dt / tau);

// Squatting is read from how far the thighs tilt forward in MediaPipe's metric 3D pose, which barely
// depends on camera height and doesn't move when the player bows or leans into a slash. It is measured
// against the player's own standing pose (the median of the last few seconds out of a squat), in degrees.
// An arm swung in front of the legs can flatten the estimate for a moment, so while the shoulders are
// still well below their standing height the squat is held for longer before it's let go.
export function squatDetector() {
  let angle = null, on = false, seen = -Infinity, last = null, low = null, stand = null, rest = [];
  const detect = (lm, world, seconds) => {
    const dt = last === null ? 0 : seconds - last;
    last = seconds;
    if (!lm || !world || KNEES.some(k => lm[k].y > 1 || lm[k].visibility < 0.3)) {
      detect.bend = null;
      if (seconds - seen > 0.5) (on = false), (angle = null), (low = null);
      return on;
    }
    seen = seconds;
    const hip = mid(world, HIPS), knee = mid(world, KNEES);
    const tilt = (Math.atan2(Math.abs(hip.z - knee.z), knee.y - hip.y) * 180) / Math.PI;
    angle = angle === null ? tilt : angle + (tilt - angle) * follow(0.08, dt);
    if (!on) rest = [...rest.filter(r => r.t > seconds - 4), { t: seconds, angle }];
    const sorted = rest.map(r => r.angle).sort((a, b) => a - b), bend = (detect.bend = angle - sorted[sorted.length >> 1]);
    const sh = mid(lm, SHOULDERS), torso = mid(lm, HIPS).y - sh.y;
    if (!on && bend < SQUAT_OUT && torso > 0.02) {
      const k = stand ? follow(1, dt) : 1;
      stand ??= { y: sh.y, torso };
      stand.y += (sh.y - stand.y) * k;
      stand.torso += (torso - stand.torso) * k;
    }
    const crouched = stand && (sh.y - stand.y) / stand.torso > 0.3;
    if (bend > SQUAT_IN) (on = true), (low = null);
    else if (on && bend < SQUAT_OUT) {
      low ??= seconds;
      if (seconds - low >= (crouched ? 0.8 : 0.15)) on = false;
    } else low = null;
    return on;
  };
  detect.bend = null;
  return detect;
}

// A slash is one stroke of a wrist around the shoulders: consecutive frames moving the same way. Each
// stroke counts once, timed at its fastest frame, if it's fast, travels far enough and isn't an upward
// wind-up. Speeds are in torso lengths per second. Returns the stroke's time in seconds, or null.
export function swingDetector() {
  let prev = null, scale = 0, last = -Infinity;
  const strokes = [null, null];
  const detect = (lm, seconds, aspect = 1) => {
    if (prev && seconds <= prev.seconds) return null;
    if (prev && seconds - prev.seconds > 0.3) prev = null;
    const dt = prev ? seconds - prev.seconds : 0, sh = mid(lm, SHOULDERS), hip = mid(lm, HIPS);
    const torso = Math.max(0.02, Math.hypot((hip.x - sh.x) * aspect, hip.y - sh.y));
    // while MediaPipe flips its guess of which way the player faces, the shoulders briefly collapse
    // together and the arms are garbage; skip those frames
    const width = Math.abs(lm[12].x - lm[11].x) * aspect;
    if (prev && width < 0.4 * prev.width) return null;
    scale = prev ? scale + (torso - scale) * follow(0.5, dt) : torso;
    const hands = WRISTS.map(w => (lm[w].visibility < 0.15 ? null : { x: ((lm[w].x - sh.x) * aspect) / scale, y: (lm[w].y - sh.y) / scale }));
    // MediaPipe sometimes swaps left and right mid-swing; follow each hand by where it just was
    const [a, b] = prev?.hands ?? [], gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    if (a && b && hands[0] && hands[1] && gap(hands[0], b) + gap(hands[1], a) < 0.5 * (gap(hands[0], a) + gap(hands[1], b))) hands.reverse();
    let hit = null;
    detect.speed = 0;
    hands.forEach((h, k) => {
      const o = prev?.hands[k];
      if (!h || !o) return (strokes[k] = null);
      const vx = (h.x - o.x) / dt, vy = (h.y - o.y) / dt, speed = Math.hypot(vx, vy);
      if (speed > 80) return (strokes[k] = null);
      detect.speed = Math.max(detect.speed, speed);
      let s = strokes[k], echo = false;
      if (s && !(speed > 1.2 && vx * s.vx + vy * s.vy > 0.3 * speed * Math.hypot(s.vx, s.vy))) {
        // a lone fast frame that snaps straight back is a landmark glitch, not a stroke
        echo = s.n === 1 && Math.hypot(h.x - s.x, h.y - s.y) < 0.4 * Math.hypot(s.dx, s.dy);
        if (!s.done && !echo && (s.n > 1 ? s.ok : s.big && !s.echo)) hit = s.at;
        s = null;
      }
      if (!s && speed > 1.2) s = { x: o.x, y: o.y, dx: 0, dy: 0, n: 0, peak: 0, echo };
      if (!(strokes[k] = s)) return;
      const rising = speed > s.peak;
      Object.assign(s, { dx: s.dx + vx * dt, dy: s.dy + vy * dt, n: s.n + 1, vx, vy }, rising && { peak: speed, at: seconds - dt / 2 });
      const d = Math.hypot(s.dx, s.dy), aimed = s.peak > SWING_SPEED && s.dy > -0.35 * d;
      s.ok = aimed && d > SWING_TRAVEL;
      s.big = aimed && d > SWING_TRAVEL * 1.5;
      if (s.n > 1 && s.ok && !s.done && !rising) (hit = s.at), (s.done = true);
    });
    prev = { hands, seconds, width: prev ? prev.width + (width - prev.width) * follow(1, dt) : width };
    if (hit === null || hit - last < 0.15) return null;
    return (last = hit);
  };
  detect.speed = 0;
  return detect;
}
