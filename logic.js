import { KHAR_KHULZ, WOLF_TOTEM } from './charts.js';

export const PERFECT = 0.07, GOOD = 0.16;

// Slash: hands closer than GRIP are on the hilt, wound up past ARM to a side, swept across in SWEEP s.
export const GRIP = 0.7, ARM = 0.35, SWEEP = 0.35;
// Squat: thigh tilt in degrees, or how much shorter the thighs look on screen (0..1).
export const SQUAT_IN = 13, SQUAT_OUT = 7, DROP_IN = 0.4, DROP_OUT = 0.25;

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
    { bar: 3, slash: true, title: 'CUT DOWN THE CHARGE', keys: 'A rider charges in. Press Space as he reaches you, on the beat.', cam: 'A rider charges in. Grip the sword in both hands beside one shoulder and cut across as he reaches you, on the beat.' },
    { bar: 9, slash: true, title: 'SPEARS', keys: 'From far out, riders throw spears. Slash each one as it reaches you, then the rider.', cam: 'From far out, riders throw spears. Cut across at each one as it reaches you, then back the other way.' },
    { bar: 15, title: 'SHIELDS', keys: 'Closer in, they hurl shields. Smash them the same way.', cam: 'Closer in, they hurl shields. Smash them the same way.' },
    { bar: 21, title: "KHAN'S WRATH", keys: 'Spears rain down in rapid succession, too fast to slash. Hold S to slow time, release when they pass.', cam: 'Spears rain down in rapid succession, too fast to slash. Squat and hold to slow time, stand up when they pass.' },
    { bar: 28, title: 'RIDE', keys: 'Now all together. Keep your combo going.', cam: 'Now all together. Keep your combo going.' },
    { bar: 33, title: 'READY FOR BATTLE', keys: 'Tutorial complete. Pick a song from the menu with Esc.', cam: 'Tutorial complete. Pick a song from the menu with Esc.' },
  ],
};

// pace is the level's time scale when standing; squatting slows it further. The tutorial runs slow so
// new riders have room to learn what a slash is, where the beat lands and how a squat feels.
export const LEVELS = {
  tutorial: { title: 'TUTORIAL', scene: 'steppe', pace: 0.7, ...TUTORIAL },
  wolf: { title: 'THE HU - WOLF TOTEM', file: 'The Hu- Wolf Totem.mp3', scene: 'steppe', pace: 1, ...WOLF_TOTEM },
  khar: { title: 'UUHAI - KHAR KHULZ', file: 'Uuhai - Khar Khulz.mp3', scene: 'night', pace: 1, ...KHAR_KHULZ },
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

// Squatting is read two ways, each against the player's own standing pose (the median of the last few
// seconds out of a squat): how far the thighs tilt forward in MediaPipe's metric 3D pose, in degrees,
// and how much shorter the thighs look on screen next to the torso. The 3D depth guess is noisy and an
// arm swung in front of the legs can flatten it, so either signal starts a squat and both must agree
// the player is standing again to end it. Bowing or leaning into a slash shortens the torso, not the
// thighs, and the longer thigh is used so lifting one knee doesn't count.
export function squatDetector() {
  let angle = null, on = false, seen = -Infinity, last = null, low = null, rest = [];
  const detect = (lm, world, seconds) => {
    const dt = last === null ? 0 : seconds - last;
    last = seconds;
    if (!lm || !world || KNEES.some(k => lm[k].y > 1 || lm[k].visibility < 0.3)) {
      detect.bend = detect.depth = null;
      if (seconds - seen > 0.5) (on = false), (angle = null), (low = null);
      return on;
    }
    seen = seconds;
    const hip = mid(world, HIPS), knee = mid(world, KNEES);
    const tilt = (Math.atan2(Math.abs(hip.z - knee.z), knee.y - hip.y) * 180) / Math.PI;
    angle = angle === null ? tilt : angle + (tilt - angle) * follow(0.08, dt);
    const torso = Math.max(0.02, mid(lm, HIPS).y - mid(lm, SHOULDERS).y);
    const ratio = Math.max(lm[25].y - lm[23].y, lm[26].y - lm[24].y) / torso;
    if (!on) rest = [...rest.filter(r => r.t > seconds - 4), { t: seconds, angle, ratio }];
    const median = key => rest.map(r => r[key]).sort((a, b) => a - b)[rest.length >> 1];
    const bend = (detect.bend = angle - median('angle')), drop = 1 - ratio / Math.max(0.05, median('ratio'));
    detect.depth = Math.max(bend / SQUAT_IN, drop / DROP_IN);
    if (bend > SQUAT_IN || drop > DROP_IN) (on = true), (low = null);
    else if (on && bend < SQUAT_OUT && drop < DROP_OUT) {
      low ??= seconds;
      if (seconds - low >= 0.15) on = false;
    } else low = null;
    return on;
  };
  detect.bend = detect.depth = null;
  return detect;
}

// A slash is a two-handed sword stroke: both hands together on the hilt, wound up to one side of the
// body, then swept across past the other side within SWEEP seconds. It's timed where the hands cross
// the middle. The stroke ends wound up on the far side, so the next slash can come straight back.
// Distances are in torso lengths from the middle of the shoulders. Returns the stroke's time, or null.
// detect.ready is the side the sword is wound up on (-1, 1 in image x, or 0); detect.together says
// whether the hands are on the hilt.
export function swingDetector() {
  let prev = null, scale = 0, last = -Infinity, ready = null;
  const detect = (lm, seconds, aspect = 1) => {
    if (prev && seconds <= prev.seconds) return null;
    if (prev && seconds - prev.seconds > 0.3) (prev = null), (ready = null);
    const dt = prev ? seconds - prev.seconds : 0, sh = mid(lm, SHOULDERS), hip = mid(lm, HIPS);
    const torso = Math.max(0.02, Math.hypot((hip.x - sh.x) * aspect, hip.y - sh.y));
    // while MediaPipe flips its guess of which way the player faces, the shoulders briefly collapse
    // together and the arms are garbage; skip those frames
    const width = Math.abs(lm[12].x - lm[11].x) * aspect;
    if (prev && width < 0.4 * prev.width) return null;
    scale = prev ? scale + (torso - scale) * follow(0.5, dt) : torso;
    prev = { seconds, width: prev ? prev.width + (width - prev.width) * follow(1, dt) : width };
    const hands = WRISTS.filter(w => lm[w].visibility >= 0.15).map(w => ({ x: ((lm[w].x - sh.x) * aspect) / scale, y: (lm[w].y - sh.y) / scale }));
    const together = (detect.together = hands.length === 2 && Math.hypot(hands[0].x - hands[1].x, hands[0].y - hands[1].y) < GRIP);
    // mid-swing one wrist often blurs out; the other one is still holding the sword
    const grip = together ? (hands[0].x + hands[1].x) / 2 : hands.length === 1 && ready ? hands[0].x : null;
    let hit = null;
    if (ready && seconds - ready.t > SWEEP) ready = null;
    if (ready && grip !== null) {
      const now = grip * ready.side;
      if (ready.x > 0 && now <= 0) ready.cross = ready.tx + ((seconds - ready.tx) * ready.x) / (ready.x - now);
      if (now < -ARM && ready.cross !== undefined) (hit = ready.cross), (ready = null);
      else (ready.x = now), (ready.tx = seconds);
    }
    if (together && Math.abs(grip) > ARM)
      ready = { side: Math.sign(grip), t: seconds, x: Math.abs(grip), tx: seconds };
    detect.ready = ready?.side ?? 0;
    if (hit === null || hit - last < 0.15) return null;
    return (last = hit);
  };
  detect.ready = 0;
  detect.together = false;
  return detect;
}
