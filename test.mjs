import assert from 'node:assert/strict';
import { BEAT, DOWNBEAT, PHRASES, SQUAT_IN, SQUAT_OUT, buildChart, judge, squatDepth, swingDetector } from './logic.js';

assert.ok(PHRASES.every(p => p.length === 32), 'every phrase is 4 bars of eighths');
const notes = buildChart();
assert.ok(notes.every((n, i) => i === 0 || n.t > notes[i - 1].t), 'notes in time order');
assert.ok(Math.abs(notes[0].t - (DOWNBEAT + 3 * 4 * BEAT)) < 1e-9, 'first note on bar 3, after the intro settles');
const eighths = n => (n.t - DOWNBEAT) / (BEAT / 2);
assert.ok(notes.every(n => Math.abs(eighths(n) - Math.round(eighths(n))) < 1e-6), "every note sits on the song's eighth-note grid");
assert.ok(notes.at(-1).t < 254, 'nothing after the final hit at 253.4 s');
assert.ok(notes.some(n => n.dense) && notes.some(n => !n.dense));

const pair = () => [{ t: 1, done: false }, { t: 1.5, done: false }];
let ns = pair();
assert.equal(judge(ns, 1.03).grade, 'perfect');
assert.equal(judge(ns, 1.03), null, 'a note can only be claimed once');
ns = pair();
assert.equal(judge(ns, 1.62).grade, 'good');
assert.equal(judge([{ t: 1.25, done: false }, { t: 1, done: false }], 1.1).t, 1, 'closest note wins');
assert.equal(judge(pair(), 2), null, 'outside the window is a whiff');

function body({ hip = 0.55, sh = 0.3, knee = 0.75, wristY = 0.5, dy = 0 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5 }));
  const at = (i, x, y) => (lm[i] = { x, y: y + dy });
  at(11, 0.45, sh), at(12, 0.55, sh), at(23, 0.47, hip), at(24, 0.53, hip), at(25, 0.47, knee), at(26, 0.53, knee);
  at(15, 0.4, wristY), at(16, 0.6, 0.55);
  return lm;
}

assert.ok(squatDepth(body()) > SQUAT_OUT, 'standing');
assert.ok(squatDepth(body({ sh: 0.45, hip: 0.7, knee: 0.74 })) < SQUAT_IN, 'deep squat');
assert.equal(squatDepth(body({ knee: 1.1 })), null, 'knees out of frame');

const run = (sw, frames) => frames.reduce((fired, lm, f) => fired + sw(lm, f / 30), 0);
const still = Array.from({ length: 10 }, () => body());
assert.equal(run(swingDetector(), still), 0, 'standing still');

const chop = Array.from({ length: 6 }, (_, f) => body({ wristY: 0.2 + f * 0.075 }));
const rest = Array.from({ length: 4 }, () => body({ wristY: 0.575 }));
assert.equal(run(swingDetector(), chop), 1, 'one chop = one slash, not one per frame');
assert.equal(run(swingDetector(), [...chop, ...rest, ...chop]), 2, 'pausing re-arms the next slash');

const drop = Array.from({ length: 7 }, (_, f) => body({ dy: f * 0.05 }));
assert.equal(run(swingDetector(), drop), 0, 'squatting is not swinging');

console.log('ok');
