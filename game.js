import { FilesetResolver, PoseLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import { BEAT, DOWNBEAT, GOOD, SQUAT_IN, SQUAT_OUT, SWING_SPEED, TRACK, buildChart, judge, squatDepth, swingDetector } from './logic.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

//TODOS:
//Make UI more opaque, more specifcally the swing and squat icons
//Fix the ger,ovoo and emeel so that they are not just floating around//

const W = 1600, H = 900, GROUND = 745, FIELD = GROUND - 80;
const SLOW = 0.5, MAX_HP = 10, WRATH = 40;
const HURT = 0.7, SLASH = 0.26;
const HIT_X = 150, NOTE_Y = 800, PX = 420;
const FLIGHT = 1.4;
const RIDER = [380, GROUND], IMPACT = [600, 520], SQUAT_IMPACT = [460, 630];
const ENEMY_SPAWN = 1500, ENEMY_SPEED = 180, ENEMY_SCALE = 0.78, REACH = 900, PASSED = RIDER[0] - 160;
const SWING_COOLDOWN = 0.35, SQUAT_COOLDOWN = 1.5;
const CELL = { gallop: [0, 1, 2, 3], slash: [4, 5], hurt: [6, 7], fallen: 8, squat: 9 }, RIDER_SCALE = 0.68;
const GOLD = '#e8c27a', RED = '#ff6b4a', BLUE = '#9fd3ff', PALE = '#cdb88f';

const $ = s => document.querySelector(s);
const ctx = $('canvas').getContext('2d');
const say = msg => ($('#status').textContent = msg);

const S = {
  spear: ['Perfect_projectile', 39, 13, 948, 125],
  spearBroken: ['Broken_Projectile', 27, 153, 824, 105],
  shield: ['Shield', 40, 16, 352, 357],
  shieldCracked: ['Shield_2', 26, 22, 343, 338],
  shieldShards: ['Shield_3', 57, 4, 254, 391],
  spark: ['Spark', 44, 25, 303, 309],
  trail: ['Sword_Trail', 15, 38, 479, 288],
  squatIcon: ['Squat Symbol', 0, 0, 296, 323],
  wrath: ["Khan's Wrath Symbol", 0, 0, 460, 388],
  legend: ['Become Legend Symbol', 0, 0, 371, 334],
  noteStrike: ['Rhythm_note_type_1', 66, 53, 232, 232],
  flare: ['Rhythm_note_type_1', 66, 325, 231, 251],
  noteShield: ['Rhythm_note_type_2', 22, 60, 169, 171],
  noteArrow: ['Rhythm_note_type_3', 57, 31, 258, 210],
  noteArrowWrath: ['Rhythm_note_type_3', 20, 258, 372, 215],
  starEmpty: ['Combo_Stars', 23, 49, 139, 136],
  starGold: ['Combo_Stars', 172, 231, 138, 135],
  starBlue: ['Combo_Stars', 467, 229, 140, 141],
};
const EN = 'Enemy Horseman/Enemy_';
const E = {
  ride: [[`${EN}horseman_Frame_1`, 10, 12, 408, 514], [`${EN}horseman_Frame_2`, 2, 26, 395, 519], [`${EN}horseman_Frame_3`, 0, 6, 396, 535],
  [`${EN}horseman_Frame_4`, 0, 14, 395, 528], [`${EN}horseman_Frame_5`, 0, 19, 385, 518]],
  hit: [`${EN}horseman_Hit_Reaction`, 55, 41, 432, 394],
  stumble: [`${EN}horseman_Stumble`, 24, 58, 456, 381],
  falling: [`${EN}horse_falling`, 34, 176, 448, 252],
  dead: [`${EN}Fallen_Horse_Death`, 45, 203, 463, 210],
};
const DIGITS = [[51, 101], [175, 65], [265, 100], [387, 93], [502, 104], [625, 94], [745, 96], [858, 98], [973, 96], [1091, 96]];

const FOLDERS = {
  Character: ['Rider_Sheet'],
  Ground: ['Background_map.jpg', 'Dirt', 'Tileable Groves', 'Ger', 'Emeel', 'Ovoo'],
  UI: ['Score_Numerals', 'Squat Symbol', "Khan's Wrath Symbol", 'Become Legend Symbol', 'Combo_Stars'],
  effects: ['Spark', 'Sword_Trail'],
  projectiles: ['Perfect_projectile', 'Broken_Projectile', 'Shield', 'Shield_2', 'Shield_3', 'Rhythm_note_type_1', 'Rhythm_note_type_2', 'Rhythm_note_type_3'],
};
const folderOf = Object.fromEntries(Object.entries(FOLDERS).flatMap(([dir, names]) => names.map(n => [n, dir])));
const assetPath = name => `assets/${folderOf[name] ? `${folderOf[name]}/` : ''}${name}${/\.\w+$/.test(name) ? '' : '.png'}`;
const IMG = {};
const files = new Set([...Object.values(S), ...Object.values(E).flatMap(v => (Array.isArray(v[0]) ? v : [v]))].map(s => s[0]).concat('Rider_Sheet', 'Background_map.jpg', 'Dirt', 'Tileable Groves', 'Ger', 'Emeel', 'Ovoo', 'Score_Numerals'));
const ac = new AudioContext();
let song;
try {
  [song] = await Promise.all([
    fetch(`assets/audio/${TRACK.file}`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`Missing assets/audio/${TRACK.file}`))))
      .then(data => ac.decodeAudioData(data)),
    ...[...files].map(name => new Promise((ok, fail) => {
      IMG[name] = Object.assign(new Image(), { onload: ok, onerror: () => fail(new Error(`Missing ${assetPath(name)}`)), src: assetPath(name) });
    })),
  ]);
} catch (e) {
  say(e.message);
  throw e;
}
function strip(name, overlap = 80, trim = 6) {
  const img = IMG[name], w = img.width - trim * 2, h = img.height - trim * 2;
  const tile = new OffscreenCanvas(w - overlap, h), fade = new OffscreenCanvas(overlap, h);
  const g = tile.getContext('2d'), f = fade.getContext('2d'), ramp = f.createLinearGradient(0, 0, overlap, 0);
  g.drawImage(img, trim, trim, w, h, 0, 0, w, h);
  f.drawImage(img, trim + w - overlap, trim, overlap, h, 0, 0, overlap, h);
  ramp.addColorStop(0, '#000');
  ramp.addColorStop(1, 'transparent');
  f.globalCompositeOperation = 'destination-in';
  f.fillStyle = ramp;
  f.fillRect(0, 0, overlap, h);
  g.drawImage(fade, 0, 0);
  return ctx.createPattern(tile, 'repeat-x');
}
const ROAD = strip('Tileable Groves'), DIRT = ctx.createPattern(IMG.Dirt, 'repeat');

const master = ac.createGain(), muffle = ac.createBiquadFilter(), musicGain = ac.createGain();
master.gain.value = 0.5;
muffle.frequency.value = 20000;
muffle.connect(master).connect(ac.destination);
musicGain.connect(muffle);
let music = null, heard = 0;

function audioClock() {
  const { contextTime, performanceTime } = ac.getOutputTimestamp();
  return performanceTime ? Math.min(ac.currentTime, contextTime + (performance.now() - performanceTime) / 1000) : ac.currentTime;
}

const songTime = () => game.t + Math.max(0, audioClock() - heard) * game.slow;

const PEAKS = Array.from({ length: 80 }, (_, i) => {
  const d = song.getChannelData(0), from = Math.floor((i * d.length) / 80), to = Math.floor(((i + 1) * d.length) / 80);
  let sum = 0;
  for (let j = from; j < to; j += 97) sum += Math.abs(d[j]);
  return sum / Math.ceil((to - from) / 97);
}).map((p, _, all) => p / Math.max(...all));

const NOISE = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
NOISE.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));

function voice(src, when, dur, vol, dest = muffle, attack = 0.004, via = src) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + dur);
  via.connect(g).connect(dest);
  src.start(when);
  src.stop(when + attack + dur + 0.05);
  return src;
}
function tone(type, freq, when, dur, vol, dest, attack) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  return voice(o, when, dur, vol, dest, attack);
}
function hiss(type, freq, when, dur, vol) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter();
  Object.assign(s, { buffer: NOISE, loop: true });
  f.type = type;
  f.frequency.value = freq;
  s.connect(f);
  voice(s, when, dur, vol, muffle, 0.002, f);
}

const sfx = {
  whoosh: () => hiss('bandpass', 1200, ac.currentTime, 0.12, 0.2),
  arrow: (w = ac.currentTime) => (tone('square', 1320, w, 0.1, 0.08), tone('square', 1990, w, 0.08, 0.05), hiss('highpass', 5000, w, 0.06, 0.25)),
  shield: (w = ac.currentTime) => (hiss('lowpass', 1100, w, 0.3, 0.7), tone('triangle', 120, w, 0.2, 0.4)),
  strike: (w = ac.currentTime) => (tone('sine', 1568, w, 0.4, 0.25), tone('sine', 2349, w, 0.25, 0.12)),
  perfect: () => tone('sine', 3136, ac.currentTime, 0.15, 0.08),
  hurt: (w = ac.currentTime) => (tone('sawtooth', 110, w, 0.3, 0.3).frequency.exponentialRampToValueAtTime(40, w + 0.3), hiss('lowpass', 500, w, 0.25, 0.6)),
  gong: () => [98, 147, 233, 311].forEach((f, i) => tone('sine', f, ac.currentTime, 2.4 - i * 0.4, 0.35 / (i + 1), muffle, 0.01)),
};

let pose = null, video = null, body = null, depth = null, camSquat = false, keySquat = false, lastTs = 0;
const swing = swingDetector();

async function startCamera() {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const options = delegate => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1 });
  pose = await PoseLandmarker.createFromOptions(fileset, options('GPU')).catch(() => PoseLandmarker.createFromOptions(fileset, options('CPU')));
  say('Allow camera access…');
  video = Object.assign(document.createElement('video'), { muted: true, playsInline: true });
  video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
  await video.play();
  video.requestVideoFrameCallback(track);
}

function track(now, meta) {
  video.requestVideoFrameCallback(track);
  const ts = (lastTs = Math.max(lastTs + 1, meta.captureTime ?? now));
  body = pose.detectForVideo(video, ts).landmarks[0] ?? null;
  depth = body && squatDepth(body);
  camSquat = depth !== null && depth < (camSquat ? SQUAT_OUT : SQUAT_IN);
  if (body && swing(body, ts / 1000, video.videoWidth / video.videoHeight)) slash(Math.min(0.3, Math.max(0, (performance.now() - ts) / 1000)));
}

let state = 'menu', mode = null, overAt = 0;
const newGame = () => ({
  t: 0, notes: buildChart(), score: 0, combo: 0, best: 0, hp: MAX_HP, perfect: 0, good: 0, miss: 0,
  swings: 0, squatTime: 0, slow: 1, hurt: 0, slash: 0, shake: 0, flash: 0, fx: [],
  squatting: false, swingReadyAt: 0, squatReadyAt: 0, enemy: { x: ENEMY_SPAWN }, corpses: [], kills: 0,
});
let game = newGame();
const multiplier = combo => (combo >= WRATH ? 8 : 1 + Math.floor(combo / 10));
const crouched = () => Math.min(1, Math.max(0, ((1 - game.slow) / (1 - SLOW) - 0.35) / 0.4));
const impact = () => IMPACT.map((v, i) => v + (SQUAT_IMPACT[i] - v) * crouched());

function begin() {
  game = newGame();
  state = 'play';
  music?.disconnect();
  music = Object.assign(ac.createBufferSource(), { buffer: song });
  music.connect(musicGain);
  musicGain.gain.cancelScheduledValues(ac.currentTime);
  musicGain.gain.setValueAtTime(1, ac.currentTime);
  music.start((heard = ac.currentTime));
}

function end() {
  state = 'over';
  overAt = clock;
  game.slow = 1;
  muffle.frequency.setTargetAtTime(20000, ac.currentTime, 0.05);
  if (game.hp > 0) {
    game.corpses.push({ x: game.enemy.x, age: 0 });
    game.enemy = null;
    return sfx.gong();
  }
  music.playbackRate.setTargetAtTime(0.05, ac.currentTime, 0.5);
  musicGain.gain.setTargetAtTime(0, ac.currentTime + 0.4, 0.4);
}

function slash(lag = 0) {
  if (state === 'ready' || (state === 'over' && clock - overAt > 2)) return sfx.whoosh(), begin();
  if (state !== 'play' || clock < game.swingReadyAt) return;
  game.swingReadyAt = clock + SWING_COOLDOWN;
  game.slash = SLASH;
  sfx.whoosh();
  game.swings++;
  const n = judge(game.notes, songTime() - lag * game.slow);
  if (n) hit(n);
}

function hit(n) {
  const perfect = n.grade === 'perfect', [x, y] = impact();
  game[n.grade]++;
  if (game.enemy.x < REACH) killEnemy();
  game.combo++;
  game.best = Math.max(game.best, game.combo);
  game.score += (perfect ? 300 : 100) * multiplier(game.combo);
  sfx[n.type]();
  if (perfect) sfx.perfect();
  if (game.combo === WRATH) {
    sfx.gong();
    game.flash = 0.6;
    popup("KHAN'S WRATH!", W / 2, 330, 72, RED);
  }
  fx(S.spark, x, y, { scale: 0.4, grow: 1.2, life: 0.3, rot: Math.random() * 6 });
  if (n.type === 'arrow') fx(S.spearBroken, x, y, { scale: 0.2, vx: 350, vy: -450, g: 1500, vr: 7, life: 0.9 });
  if (n.type === 'shield') {
    fx(S.shieldCracked, x, y, { scale: 0.24, life: 0.15 });
    fx(S.shieldShards, x, y, { scale: 0.24, vx: 250, vy: -350, g: 1300, vr: 4, life: 0.9 });
  }
  if (n.type === 'strike') fx(S.flare, x, y, { scale: 0.35, grow: 1.5, life: 0.4 });
  fx(S.flare, HIT_X, NOTE_Y, { scale: perfect ? 0.5 : 0.35, grow: 1, life: 0.35 });
  popup(perfect ? 'PERFECT!' : 'GOOD', HIT_X + 20, NOTE_Y - 70, 30, perfect ? BLUE : GOLD, true);
}

function killEnemy() {
  game.corpses.push({ x: game.enemy.x, age: 0 });
  game.enemy = { x: ENEMY_SPAWN };
  game.kills++;
  game.score += 500 * multiplier(game.combo);
  sfx.shield();
  popup('SLAIN!', W / 2, 330, 56, GOLD);
}

function damage() {
  game.hp--;
  game.hurt = HURT;
  game.shake = 16;
  sfx.hurt();
}

function miss(n) {
  n.done = true;
  n.grade = 'miss';
  game.miss++;
  game.combo = 0;
  popup('MISS', HIT_X + 20, NOTE_Y - 70, 30, RED, true);
  if (n.type !== 'strike') damage();
}

function update(dt) {
  const wants = camSquat || keySquat, now = audioClock();
  if (game.squatting && !wants) {
    game.squatting = false;
    game.squatReadyAt = clock + SQUAT_COOLDOWN;
  } else if (!game.squatting && wants && clock >= game.squatReadyAt) game.squatting = true;
  const squatting = game.squatting;
  if (now > heard) {
    game.t += (now - heard) * game.slow;
    heard = now;
  }
  game.slow += ((squatting ? SLOW : 1) - game.slow) * Math.min(1, dt * 6);
  music.playbackRate.value = game.slow;
  if (squatting) game.squatTime += dt;
  muffle.frequency.setTargetAtTime(1500 * 13 ** ((game.slow - SLOW) / (1 - SLOW)), ac.currentTime, 0.05);
  if (game.t > game.notes[0].t - 3) game.enemy.x -= ENEMY_SPEED * game.slow * dt;
  if (game.enemy.x < PASSED) {
    damage();
    popup('ENEMY GOT PAST', W / 2, 330, 48, RED);
    game.enemy = { x: ENEMY_SPAWN };
  }
  for (const n of game.notes) if (!n.done && game.t > n.t + GOOD) miss(n);
  if (game.hp <= 0 || game.t >= song.duration) end();
}

const fx = (sprite, x, y, o) => game.fx.push({ sprite, x, y, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, grow: 0, scale: 1, age: 0, life: 0.5, ...o });
function popup(text, x, y, size, color, judgement = false) {
  if (judgement) game.fx = game.fx.filter(f => !f.judgement);
  fx(null, x, y, { text, size, color, judgement, vy: -50, life: 0.8 });
}

function spr([name, sx, sy, sw, sh], x, y, scale, { rot = 0, alpha = 1, ay = 0.5, flip = false } = {}) {
  const w = sw * scale, h = sh * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(IMG[name], sx, sy, sw, sh, -w / 2, -h * ay, w, h);
  ctx.restore();
}

function text(str, x, y, size, color = GOLD, align = 'left') {
  ctx.font = `700 ${size}px Cinzel, Georgia, serif`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,.85)';
  ctx.shadowBlur = 6;
  ctx.fillText(str, x, y);
  ctx.shadowBlur = 0;
}

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(12,10,8,.72)';
  ctx.strokeStyle = 'rgba(232,194,122,.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();
}

function number(n, x, y, h) {
  for (const d of String(n)) {
    const [sx, sw] = DIGITS[d];
    ctx.drawImage(IMG.Score_Numerals, sx, 20, sw, 143, x, y, (sw * h) / 143, h);
    x += (sw * h) / 143 + 3;
  }
}

const fill = style => ((ctx.fillStyle = style), ctx.fillRect(0, 0, W, H));
const clockText = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function panorama(speed) {
  const img = IMG['Background_map.jpg'], h = FIELD + 10, w = (img.width * h) / img.height, off = (scroll * speed) % (2 * w);
  for (let i = 0, x = -off; x < W; i++, x += w) {
    if (x + w < 0) continue;
    ctx.save();
    ctx.translate(i % 2 ? x + w : x, 0);
    ctx.scale(i % 2 ? -1 : 1, 1);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
  }
}

const PROP_LOOP = 3400;
const PROPS = [
  [['Ger', 0, 0, 567, 440], 250, 0.36], [['Emeel', 0, 0, 505, 465], 520, 0.2], [['Ger', 0, 0, 567, 440], 760, 0.3],
  [['Ovoo', 0, 0, 374, 411], 1600, 0.34], [['Ger', 0, 0, 567, 440], 2500, 0.34], [['Emeel', 0, 0, 505, 465], 2780, 0.18],
];
function props(speed) {
  const off = (scroll * speed) % PROP_LOOP;
  for (const [sprite, px, scale] of PROPS) {
    for (const x of [px - off, px - off + PROP_LOOP]) {
      if (x > -200 && x < W + 200) spr(sprite, x, FIELD + 12, scale, { ay: 1 });
    }
  }
}

function band(p, scale, offset, y, h) {
  p.setTransform(new DOMMatrix([scale, 0, 0, scale, -offset, y]));
  ctx.fillStyle = p;
  ctx.fillRect(0, y, W, h);
}

function drawWorld() {
  panorama(0.08);
  props(0.5);
  band(ROAD, 0.72, scroll, FIELD, H - FIELD);
}

function drawEnemies() {
  for (const c of game.corpses) spr(c.age < 0.3 ? E.hit : c.age < 0.9 ? E.falling : E.dead, c.x, GROUND, ENEMY_SCALE, { ay: 1, flip: true });
  const e = game.enemy;
  if (!e) return;
  const stride = ((((state === 'play' ? game.t - DOWNBEAT : clock) / (BEAT / 2)) % 1) + 1) % 1;
  spr(E.ride[Math.floor(stride * E.ride.length)], e.x, GROUND, ENEMY_SCALE, { ay: 1, flip: true });
  const bx = e.x - 45, by = GROUND - 430;
  ctx.fillStyle = 'rgba(12,10,8,.8)';
  ctx.fillRect(bx - 2, by - 2, 94, 14);
  ctx.fillStyle = e.x < REACH ? RED : '#b0382a';
  ctx.fillRect(bx, by, 90, 10);
  if (e.x < REACH) text('IN REACH', e.x, by - 8, 14, GOLD, 'center');
}

const launchPoint = () => [(game.enemy?.x ?? ENEMY_SPAWN) - 5, GROUND - 180];
const arc = (p, [fx, fy], [tx, ty]) => [fx + (tx - fx) * p, fy + (ty - fy) * p - Math.sin(Math.min(1, p) * Math.PI) * 110];

function drawProjectiles() {
  const target = impact();
  for (const n of game.notes) {
    const left = n.t - game.t;
    if (left > FLIGHT) break;
    if (n.done || left < -GOOD) continue;
    n.from ??= launchPoint();
    const p = 1 - left / FLIGHT, [x, y] = arc(p, n.from, target), [x2, y2] = arc(p + 0.01, n.from, target);
    if (n.type === 'arrow') spr(S.spear, x, y, 0.2, { rot: Math.atan2(y2 - y, x2 - x) });
    else if (n.type === 'shield') spr(S.shield, x, y, 0.24, { rot: game.t * 9 });
    else spr(S.noteStrike, x, y, 0.3 + 0.03 * Math.sin(game.t * 20));
  }
}

function riderCell(cell, alpha, dx = 0, dy = 0) {
  const k = RIDER_SCALE;
  ctx.globalAlpha = alpha;
  ctx.drawImage(IMG.Rider_Sheet, cell * 600, 0, 600, 480, RIDER[0] + dx - 290 * k, RIDER[1] + dy - 440 * k, 600 * k, 480 * k);
  ctx.globalAlpha = 1;
}

function drawRider() {
  const crouch = crouched(), knock = -26 * Math.max(0, game.hurt / HURT), sinceSlash = SLASH - game.slash;
  if (state === 'over' && game.hp <= 0) return riderCell(CELL.fallen, 1);
  if (crouch < 1) {
    const stride = ((((state === 'play' ? game.t - DOWNBEAT : clock) / (BEAT / 2)) % 1) + 1) % 1;
    const cell = game.hurt > 0 ? CELL.hurt[game.hurt > HURT - 0.15 ? 0 : 1]
      : game.slash > 0 && sinceSlash < 0.14 ? CELL.slash[sinceSlash < 0.07 ? 0 : 1]
        : CELL.gallop[Math.floor(stride * 4)];
    riderCell(cell, 1 - crouch, knock, -5 * Math.sin(stride * 2 * Math.PI));
  }
  if (crouch > 0) riderCell(CELL.squat, crouch, knock);
  if (game.slash > 0 && sinceSlash >= 0.14) {
    const [x, y] = impact();
    spr(S.trail, x - 30, y + 10, 0.5 - 0.15 * crouch, { alpha: game.slash / (SLASH - 0.14) });
  }
}

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]];

function meter(label, x, y, w, value, mark) {
  const bx = x + 64, bw = w - 64;
  text(label, x, y + 10, 12, PALE);
  ctx.fillStyle = '#2b251e';
  ctx.fillRect(bx, y, bw, 10);
  ctx.fillStyle = value >= mark ? RED : GOLD;
  ctx.fillRect(bx, y, bw * Math.min(1, Math.max(0, value)), 10);
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx + bw * mark - 1, y - 3, 2, 16);
}

function drawCamera() {
  const x = 1368, y = 196, w = 212;
  if (mode === 'keys') {
    panel(x - 8, y - 8, w + 16, 66);
    text('KEYBOARD', x + w / 2, y + 18, 16, GOLD, 'center');
    text('Space slash · hold S squat', x + w / 2, y + 44, 13, PALE, 'center');
  }
  if (mode !== 'cam') return;
  const h = video.videoWidth ? (w * video.videoHeight) / video.videoWidth : w * 0.75;
  panel(x - 8, y - 8, w + 16, h + 70);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + w, y);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  if (body) {
    ctx.strokeStyle = camSquat ? BLUE : GOLD;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      ctx.moveTo(body[a].x * w, body[a].y * h);
      ctx.lineTo(body[b].x * w, body[b].y * h);
    }
    ctx.stroke();
  }
  ctx.restore();
  if (!body) text('STEP INTO VIEW', x + w / 2, y + h / 2, 16, RED, 'center');
  meter('SWING', x, y + h + 16, w, swing.speed / (2 * SWING_SPEED), 0.5);
  meter('SQUAT', x, y + h + 42, w, depth === null ? 0 : 1 - depth, 1 - SQUAT_IN);
}

function cooldownIcon(sprite, x, y, wait, total, active, label) {
  const r = 38;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = 'rgba(12,10,8,.8)';
  ctx.fill();
  ctx.clip();
  spr(sprite, x, y, 60 / Math.max(sprite[3], sprite[4]), { alpha: wait > 0 ? 0.45 : 1 });
  if (wait > 0) {
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, wait / total));
    ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = active ? 4 : 2;
  ctx.strokeStyle = active ? GOLD : wait > 0 ? '#5f574b' : 'rgba(232,194,122,.7)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.stroke();
  text(wait > 0 ? wait.toFixed(1) : label, x, y + r + 20, 14, wait > 0 ? PALE : GOLD, 'center');
}

function drawHud(wrath, slowAmt, pulse) {
  panel(20, 18, 420, 292);
  spr(S.legend, 72, 70, 0.25);
  text('SCORE', 135, 46, 20);
  number(game.score, 135, 56, 50);
  text('COMBO', 40, 152, 20);
  text('x', 40, 204, 40);
  number(game.combo, 72, 164, 46);
  for (let i = 0; i < 4; i++) spr(wrath ? S.starBlue : game.combo >= (i + 1) * 10 ? S.starGold : S.starEmpty, 58 + i * 46, 240, 0.27);
  const life = Math.max(0, game.hp) / MAX_HP;
  text('HP', 40, 290, 18);
  ctx.fillStyle = '#2b251e';
  ctx.fillRect(84, 274, 330, 18);
  ctx.fillStyle = life > 0.5 ? '#6fbf4a' : life > 0.25 ? GOLD : RED;
  ctx.fillRect(84, 274, 330 * life, 18);
  ctx.strokeStyle = 'rgba(232,194,122,.6)';
  ctx.strokeRect(84, 274, 330, 18);
  if (state === 'play' || state === 'ready') {
    cooldownIcon(S.trail, 70, 370, game.swingReadyAt - clock, SWING_COOLDOWN, game.slash > 0, 'SWING');
    cooldownIcon(S.squatIcon, 170, 370, game.squatReadyAt - clock, SQUAT_COOLDOWN, game.squatting, 'SQUAT');
  }

  const mx = 520, mw = 560;
  panel(mx, 18, mw, 66);
  text(`MUSIC: ${TRACK.title}`, mx + 20, 44, 16);
  text(`${clockText(game.t)} / ${clockText(song.duration)}`, mx + mw - 20, 44, 16, GOLD, 'right');
  PEAKS.forEach((peak, i) => {
    const h = 3 + 14 * peak ** 2;
    ctx.fillStyle = i / PEAKS.length < game.t / song.duration ? '#d8432c' : '#5f574b';
    ctx.fillRect(mx + 20 + (i * (mw - 40)) / PEAKS.length, 66 - h / 2, 3, h);
  });

  ctx.save();
  if (wrath) Object.assign(ctx, { shadowColor: '#ff3b1f', shadowBlur: 25 + 25 * pulse });
  else ctx.globalAlpha = 0.35;
  spr(S.wrath, 1474, 84, 0.3);
  ctx.restore();
  text("KHAN'S WRATH", 1474, 172, 18, wrath ? RED : '#8c7b66', 'center');
  drawCamera();

  const g = ctx.createLinearGradient(0, 752, 0, H);
  g.addColorStop(0, 'rgba(8,8,10,.3)');
  g.addColorStop(0.3, 'rgba(8,8,10,.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 752, W, H - 752);
  ctx.fillStyle = wrath ? 'rgba(220,70,40,.7)' : 'rgba(150,190,230,.6)';
  ctx.fillRect(40, 845, W - 80, 2);
  ctx.fillStyle = '#e9e4da';
  for (let b = Math.ceil((game.t - DOWNBEAT - HIT_X / PX) / BEAT); ; b++) {
    const x = HIT_X + (DOWNBEAT + b * BEAT - game.t) * PX;
    if (x > W - 40) break;
    if (x < 40) continue;
    ctx.beginPath();
    ctx.arc(x, 846, b % 4 ? 3 : 5, 0, 7);
    ctx.fill();
  }
  spr(S.flare, HIT_X, NOTE_Y, 0.3 * (1 + 0.15 * pulse));
  for (const n of game.notes) {
    const x = HIT_X + (n.t - game.t) * PX;
    if (x > W + 60) break;
    if (n.done || x < -60) continue;
    const s = n.type === 'arrow' ? (wrath ? S.noteArrowWrath : S.noteArrow) : n.type === 'shield' ? S.noteShield : S.noteStrike;
    spr(s, x, NOTE_Y, 62 / Math.max(s[3], s[4]));
  }
  const slow = slowAmt > 0.5;
  text(slow ? '‹‹  SLOW MOTION  ››' : 'NORMAL SPEED', W / 2, 882, 18, slow ? GOLD : '#9fc4e8', 'center');
}

function drawPrompts(slowAmt) {
  if (state !== 'play') return;
  const countIn = game.notes[0].t - game.t;
  if (countIn > 0) {
    const beats = Math.ceil(countIn / BEAT);
    text(beats > 4 ? 'GET READY' : String(beats), W / 2, 340, beats > 4 ? 64 : 120, GOLD, 'center');
  }
  if (slowAmt < 0.5 && game.notes.some(n => n.dense && !n.done && n.t > game.t && n.t - game.t < 2.5)) {
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(clock * 10);
    panel(580, 330, 440, 96);
    spr(S.squatIcon, 635, 378, 0.26);
    text('SQUAT AND HOLD', 692, 390, 32, GOLD);
    ctx.globalAlpha = 1;
  }
}

function drawFx() {
  for (const f of game.fx) {
    const k = f.age / f.life;
    ctx.globalAlpha = 1 - k;
    if (f.sprite) spr(f.sprite, f.x, f.y, f.scale * (1 + f.grow * k), { rot: f.rot });
    else if (f.text) text(f.text, f.x, f.y, f.size, f.color, 'center');
    else {
      ctx.fillStyle = DIRT;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, 7);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawScreens() {
  if (state === 'ready') {
    const cam = mode === 'cam';
    const tip = !cam ? 'Space to slash · hold S to squat'
      : !body ? 'Step into the camera view'
        : depth === null ? 'Step back until your knees are visible'
          : 'Rider ready. Swing your arm to begin!';
    panel(450, 300, 700, 190);
    text(cam ? 'SWING TO RIDE' : 'PRESS SPACE TO RIDE', W / 2, 372, 46, GOLD, 'center');
    text(tip, W / 2, 428, 24, cam && depth === null ? RED : '#e9e4da', 'center');
    text('Slash on the beat · Squat to slow time', W / 2, 464, 18, PALE, 'center');
  }
  if (state === 'over') {
    const won = game.hp > 0, hits = game.perfect + game.good;
    const rows = [
      ['Score', game.score],
      ['Best combo', game.best],
      ['Perfect / Good / Miss', `${game.perfect} / ${game.good} / ${game.miss}`],
      ['Accuracy', `${Math.round((100 * hits) / Math.max(1, hits + game.miss))}%`],
      ['Swings', game.swings],
      ['Enemies slain', game.kills],
      ['Time squatting', `${game.squatTime.toFixed(1)} s`],
    ];
    panel(470, 150, 660, 520);
    text(won ? 'YOU BECAME LEGEND' : 'FALLEN ON THE STEPPE', W / 2, 225, 46, won ? GOLD : RED, 'center');
    rows.forEach(([k, v], i) => {
      text(k, 540, 300 + i * 44, 24, PALE);
      text(String(v), 1060, 300 + i * 44, 24, '#fff', 'right');
    });
    if (clock - overAt > 2) text(mode === 'cam' ? 'Swing to ride again' : 'Press Space to ride again', W / 2, 636, 26, GOLD, 'center');
  }
}

function draw() {
  const wrath = state === 'play' && game.combo >= WRATH;
  const slowAmt = (1 - game.slow) / (1 - SLOW);
  const pulse = 1 - (((((game.t - DOWNBEAT) / BEAT) % 1) + 1) % 1);
  ctx.save();
  if (game.shake > 0.5) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  drawWorld();
  drawProjectiles();
  drawEnemies();
  drawRider();
  ctx.restore();
  if (slowAmt > 0.01) fill(`rgba(40,90,170,${0.22 * slowAmt})`);
  if (wrath) {
    const v = ctx.createRadialGradient(W / 2, H / 2, 250, W / 2, H / 2, 950);
    v.addColorStop(0, 'rgba(200,30,10,0)');
    v.addColorStop(1, `rgba(200,30,10,${0.3 + 0.3 * pulse})`);
    fill(v);
  }
  if (game.hurt > 0) fill(`rgba(190,20,10,${0.45 * (game.hurt / HURT) ** 2})`);
  if (game.flash > 0) fill(`rgba(255,235,200,${game.flash})`);
  drawHud(wrath, slowAmt, pulse);
  drawPrompts(slowAmt);
  drawFx();
  drawScreens();
}

let last = performance.now(), clock = 0, scroll = 0, dust = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;
  if (state === 'play') update(dt);
  const pace = state === 'play' ? game.slow * (1 - crouched()) : state === 'over' && game.hp <= 0 ? 0 : 1;
  scroll += dt * 650 * pace;
  if ((dust += dt * pace) > 0.06) {
    dust = 0;
    fx(null, RIDER[0] - 110 + Math.random() * 60, GROUND - 12, { vx: -300 - Math.random() * 200, vy: -80 - Math.random() * 160, g: 700, r: 4 + Math.random() * 7 });
  }
  const fdt = dt * (state === 'play' ? game.slow : 1);
  game.fx = game.fx.filter(f => {
    f.age += fdt;
    f.vy += f.g * fdt;
    f.x += f.vx * fdt;
    f.y += f.vy * fdt;
    f.rot += f.vr * fdt;
    return f.age < f.life;
  });
  game.hurt -= dt;
  game.slash -= dt;
  for (const c of game.corpses) {
    c.age += dt;
    c.x -= 650 * pace * dt;
  }
  game.corpses = game.corpses.filter(c => c.x > -300);
  game.flash -= dt;
  game.shake *= 0.88;
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('keydown', e => {
  if (state === 'menu' || e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    slash();
  }
  if (e.code === 'KeyS' || e.code === 'ArrowDown') keySquat = true;
});
addEventListener('keyup', e => {
  if (e.code === 'KeyS' || e.code === 'ArrowDown') keySquat = false;
});
addEventListener('visibilitychange', () => (document.hidden ? ac.suspend() : ac.resume()));

const buttons = [$('#cam'), $('#keys')];
function go(m) {
  mode = m;
  state = 'ready';
  $('#menu').hidden = true;
}
$('#keys').onclick = () => (ac.resume(), go('keys'));
$('#cam').onclick = async () => {
  ac.resume();
  buttons.forEach(b => (b.disabled = true));
  say('Loading pose model…');
  try {
    await startCamera();
    go('cam');
  } catch (e) {
    say(`Webcam unavailable (${e.message}). You can still play in keyboard mode.`);
    buttons.forEach(b => (b.disabled = false));
  }
};
buttons.forEach(b => (b.disabled = false));
say('Webcam: stand 2–3 m back so your knees are in view. Keyboard: Space slashes, hold S to squat.');
