import assert from 'node:assert/strict';
import { LEVELS, beatMap, buildChart, judge, planRaids, squatDetector, swingDetector } from './logic.js';

for (const [id, level] of Object.entries(LEVELS)) {
  const beat = beatMap(level), say = what => `${id}: ${what}`;
  assert.ok(level.chart.every(bar => /^[.as*]{8}$/.test(bar)), say('every bar is 8 eighths of spears, shields and strikes'));
  const notes = buildChart(level);
  assert.ok(notes.every((n, i) => i === 0 || n.t > notes[i - 1].t), say('notes in time order'));
  assert.ok(notes[0].t >= beat.at(level.firstBar * 4) - 1e-9, say('nothing before the first bar, while the intro settles'));
  const eighths = n => beat.of(n.t) * 2;
  assert.ok(notes.every(n => Math.abs(eighths(n) - Math.round(eighths(n))) < 1e-6), say("every note sits on the song's eighth notes"));
  assert.ok(notes.some(n => n.dense) && notes.some(n => !n.dense), say('runs of eighths to squat through, and room to breathe'));
  const raids = planRaids(notes);
  assert.ok(notes.every(n => raids.includes(n.raid) && n.raid.notes.includes(n)), say('every note has a horseman'));
  assert.ok(raids.every(r => r.strike === r.notes.at(-1) && r.notes.filter(n => n.type === 'strike').length === 1), say('each horseman ends his raid with one charge'));
  assert.ok(raids.every(r => r.notes.every(n => r.strike.t - n.t < 2.75 || n.dense)), say('he throws only as he closes in, or in a volley'));
}
assert.ok(buildChart(LEVELS.wolf).at(-1).t < 254.5, 'Wolf Totem: nothing after the final hit at 254.1 s');
assert.ok(buildChart(LEVELS.khar).at(-1).t < 233, 'Khar Khulz: nothing after the band stops');
assert.ok(LEVELS.tutorial.lessons.every((l, i, all) => i === 0 || l.bar > all[i - 1].bar), 'tutorial lessons in order');

const drift = beatMap({ beats: [1, 1.5, 2.1, 2.6] });
assert.equal(drift.at(1.5), 1.8, 'a beat map follows a drifting tempo between beats');
assert.equal(drift.of(1.8), 1.5);
assert.equal(drift.at(-1), 0.5, '...and carries on at the edges');
assert.ok(Math.abs(drift.at(4) - 3.1) < 1e-9);

const pair = () => [{ t: 1, done: false }, { t: 1.5, done: false }];
let ns = pair();
assert.equal(judge(ns, 1.03).grade, 'perfect');
assert.equal(judge(ns, 1.03), null, 'a note can only be claimed once');
ns = pair();
assert.equal(judge(ns, 1.62).grade, 'good');
assert.equal(judge([{ t: 1.25, done: false }, { t: 1, done: false }], 1.1).t, 1, 'closest note wins');
assert.equal(judge(pair(), 2), null, 'outside the window is a whiff');

function body({ hip = 0.55, sh = 0.3, knee = 0.75, wristY = 0.5, wristX = 0.4, dy = 0, grip = null, sit = 0 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  const at = (i, x, y) => (lm[i] = { x, y: y + dy, z: 0, visibility: 0.9 });
  at(11, 0.45, sh + sit), at(12, 0.55, sh + sit), at(23, 0.47, hip + sit), at(24, 0.53, hip + sit), at(25, 0.47, knee), at(26, 0.53, knee);
  if (grip) at(15, grip[0] - 0.02, grip[1]), at(16, grip[0] + 0.02, grip[1]);
  else at(15, wristX, wristY), at(16, 0.6, 0.55);
  return lm;
}

// torso is 0.25 of the frame, so the sides are past 0.5 ± 0.09
const run = (sw, frames, fps = 30) => frames.map((lm, f) => sw(lm, f / fps)).filter(t => t !== null);
const hold = (n, p) => Array.from({ length: n }, () => body(p));
const sweep = (n, from, to, y = 0.45) => Array.from({ length: n }, (_, f) => body({ grip: [from + ((to - from) * (f + 1)) / n, y] }));
const right = hold(5, { grip: [0.72, 0.3] }), left = hold(5, { grip: [0.28, 0.3] });
assert.deepEqual(run(swingDetector(), hold(10)), [], 'standing still');

const cut = run(swingDetector(), [...right, ...sweep(5, 0.72, 0.28)]);
assert.equal(cut.length, 1, 'both hands wound up to one side and swept across = one slash');
assert.ok(Math.abs(cut[0] - 7 / 30) < 1 / 30, 'timed where the sword crosses the middle');
assert.equal(run(swingDetector(), [...right, ...sweep(5, 0.72, 0.28), ...left, ...sweep(5, 0.28, 0.72)]).length, 2, 'and straight back the other way');
assert.equal(run(swingDetector(), [...right, ...sweep(5, 0.72, 0.28), ...left, ...sweep(5, 0.28, 0.72)].filter((_, f) => f % 2 === 0), 15).length, 2, 'works at 15 fps');
assert.deepEqual(run(swingDetector(), sweep(6, 0.5, 0.28)), [], 'no wind-up, no slash');
assert.deepEqual(run(swingDetector(), [...right, ...sweep(60, 0.72, 0.28)]), [], 'drifting the hands across slowly is not a slash');
assert.deepEqual(run(swingDetector(), [...right, ...sweep(5, 0.72, 0.6)]), [], 'stopping short of the other side is not a slash');

const chop = Array.from({ length: 6 }, (_, f) => body({ wristY: 0.2 + f * 0.075 }));
const swipe = Array.from({ length: 6 }, (_, f) => body({ wristX: 0.2 + f * 0.06, wristY: 0.45 }));
assert.deepEqual(run(swingDetector(), [...chop, ...swipe]), [], 'one hand alone is not a sword');
const drop = Array.from({ length: 7 }, (_, f) => body({ dy: f * 0.05, grip: [0.72, 0.4] }));
assert.deepEqual(run(swingDetector(), drop), [], 'squatting is not swinging');

// World landmarks are metric, hip-centred, y down and z away from the camera.
function pose({ thigh = 3, crouch = 0, lean = 0, sit = crouch } = {}) {
  const lm = body({ sit: sit * 0.15 });
  const r = (thigh * Math.PI) / 180, w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [s, x] of [[0, -0.1], [1, 0.1]]) {
    w[23 + s] = { x, y: 0, z: 0 };
    w[25 + s] = { x, y: 0.42 * Math.cos(r), z: -0.42 * Math.sin(r) };
    w[11 + s] = { x: x * 1.8, y: -0.5 * Math.cos((lean * Math.PI) / 180), z: -0.5 * Math.sin((lean * Math.PI) / 180) };
  }
  return [lm, w];
}
const feed = (sq, frames, t0 = 0) => frames.map(([lm, w], f) => sq(lm, w, t0 + f / 30));
const still = (n, p) => Array.from({ length: n }, () => pose(p));
const down = Array.from({ length: 10 }, (_, f) => pose({ thigh: 3 + (f + 1) * 5, crouch: (f + 1) / 10 }));

let sq = squatDetector();
assert.ok(!feed(sq, still(20)).some(Boolean), 'standing');
assert.ok(feed(sq, [...down, ...still(5, { thigh: 50, crouch: 1 })], 1).at(-1), 'squatting');
assert.ok(feed(sq, still(30, { thigh: 5, crouch: 1 }), 2).at(-1), 'a flattened 3D guess does not drop a squat the camera still sees');
assert.ok(feed(sq, [[null, null], [null, null], [null, null]], 3).at(-1), 'a few lost frames keep the squat');
assert.ok(!feed(sq, still(10), 3.2).at(-1), 'standing up lets go quickly');

sq = squatDetector();
feed(sq, still(20));
assert.ok(feed(sq, still(5, { thigh: 50, sit: 0 }), 1).at(-1), 'the 3D thigh tilt alone is a squat');
sq = squatDetector();
feed(sq, still(20));
assert.ok(feed(sq, still(5, { thigh: 3, sit: 1 }), 1).at(-1), '...and so are thighs shortened on screen alone');

sq = squatDetector();
assert.ok(!feed(sq, [...still(20), ...still(30, { thigh: 5, sit: 0, lean: 45 })]).some(Boolean), 'bowing is not squatting');
const knee = pose({ sit: 0.6 })[0];
knee[25].y = knee[23].y + 0.2;
sq = squatDetector();
assert.ok(!feed(sq, [...still(20), ...Array.from({ length: 10 }, () => [knee, pose()[1]])]).some(Boolean), 'lifting one knee is not squatting');
feed(sq, [pose({ thigh: 3 }).map((v, i) => (i ? v : body({ knee: 1.1 })))], 3);
assert.equal(sq.bend, null, 'knees out of frame');

console.log('ok');
