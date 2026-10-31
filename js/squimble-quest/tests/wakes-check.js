// checks wakes (wakes.js): walking drops points along the path, the arms open out into a V behind at
// about WAKE.angle, going round in circles the inside arm fades rather than bunching up, and steering
// round with the keys nothing jumps from one frame to the next, spinning on the spot or turning round
// the wake they had stays to fade, a wake's let go and fades when nobody's making it, a liquid with
// wake 0 makes none, and a warp starts a new one rather than
// drawing across the map. run it with
// node js/squimble-quest/tests/wakes-check.js
// no output means it all passed
const assert = require('assert');
const { load } = require('./load');

// a canvas that remembers every point the arms go through and each bit's width, and each bit as a
// line (with arm, 1 or -1, which arm it's in)
let drawn = [];
let segs = [];
let arm = 0;
const at = (x, y) => drawn.push({ x, y, width: ctx.lineWidth });
const ctx = {
  canvas: { width: 960, height: 540 }, save() {}, restore() {}, beginPath() {}, stroke() {}, clearRect() {}, drawImage() {}, setTransform() {}, getTransform: () => null,
  moveTo: at,
  lineTo: (x, y) => {
    const from = drawn[drawn.length - 1];
    segs.push({ arm, x1: from.x, y1: from.y, x2: x, y2: y, width: ctx.lineWidth });
    at(x, y);
  },
};
ctx.getContext = () => ctx;
const game = load(['config.js', 'utils.js', 'wakes.js'], { hexToRgb: () => [255, 255, 255], drawingContext: ctx, document: { createElement: () => ctx } });
const { Wakes, WAKE, TILE } = game;
const drawArm = Wakes.drawArm.bind(Wakes);
Wakes.drawArm = (layer, wake, points, side) => {
  arm = side;
  drawArm(layer, wake, points, side);
};

const water = { sink: 0.4, wake: 1, surfaceColour: '#ffffff' };
const map = { clipToLiquid() {} };
const view = { left: -1000, right: 1000, top: -1000, bottom: 1000 };
const wader = () => ({ x: 0, y: -28, w: 28, h: 56 });
// moves it at speed px/s along dx, dy for seconds, following and ageing like the game does
function wade(c, dx, dy, speed, seconds, liquid = water) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    c.x += (dx * speed) / 60;
    c.y += (dy * speed) / 60;
    Wakes.follow(c, liquid, 1, 1 / 60);
    Wakes.update(1 / 60);
  }
}

// walking right at wading speed for a second: a point every WAKE.spacing px along the source's path,
// which ends up about WAKE.round px behind the feet
const c = wader();
wade(c, 1, 0, 100, 1);
const wake = Wakes.following.get(c);
assert(wake, 'walking in water makes a wake');
assert(Math.abs(wake.points.length - (100 - WAKE.round) / WAKE.spacing) <= 2, `a point every ${WAKE.spacing} px (${wake.points.length} in 100 px)`);
assert(Math.abs(c.x - wake.source.x - WAKE.round) < 3, `the source follows about WAKE.round px behind (${(c.x - wake.source.x).toFixed(1)} px)`);

// its arms open out behind it: the oldest bit is further from the path than the newest, by about
// the angle, and one arm's above the path and the other below
drawn = [];
Wakes.draw(view, map);
const above = drawn.filter((p) => p.y < -0.5);
const below = drawn.filter((p) => p.y > 0.5);
assert(above.length && below.length, 'an arm each side');
const tail = above.reduce((a, b) => (b.x < a.x ? b : a));
const head = above.reduce((a, b) => (b.x > a.x ? b : a));
assert(tail.x < head.x - 50 && Math.abs(tail.y) > Math.abs(head.y) + 5, `it opens out behind (head ${head.x}, ${head.y}, tail ${tail.x}, ${tail.y})`);
// up and down the screen it opens squashed (WAKE.squash), so that's undone first
const opens = Math.atan2((Math.abs(tail.y) - Math.abs(head.y)) / WAKE.squash, head.x - tail.x) * (180 / Math.PI);
assert(opens > WAKE.angle * 0.5 && opens < WAKE.angle * 1.5, `opens at about WAKE.angle (${opens.toFixed(1)} degrees)`);

// standing still it makes no more, and walking out (nobody follows it) lets it go to fade away
const count = wake.points.length;
wade(c, 0, 0, 0, 0.5);
assert(wake.points.length < count, 'standing still, the old points fade and no new ones come');
// a hit's freeze (a few frames nobody follows it) keeps it, and longer lets it go
for (let i = 0; i < 6; i++) Wakes.update(1 / 60);
assert.strictEqual(Wakes.following.get(c), wake, 'a short freeze keeps the same wake');
for (let i = 0; i < Math.ceil(WAKE.letGo * 60); i++) Wakes.update(1 / 60);
assert(!Wakes.following.has(c), 'nobody following it, it lets go');
for (let i = 0; i < 120; i++) Wakes.update(1 / 60);
assert(!Wakes.list.includes(wake), `faded out after WAKE.life (${WAKE.life} s)`);

// a liquid with no wake makes none
Wakes.clear();
wade(wader(), 1, 0, 100, 0.5, { ...water, wake: 0 });
assert.strictEqual(Wakes.list.length, 0, 'wake 0 makes no wake');

// going round in a tight circle (several times, so its heading goes all the way round) the arm on the
// inside thins rather than looping over the path or bunching up in the middle, so nothing thick's
// drawn inside the circle away from where it's leaving the ring, and the outside one still shows. the
// feet go round 50 px from (0, 0), well inside how far the arms reach
Wakes.clear();
const circler = wader();
const radius = 50;
for (let i = 0; i < 600; i++) {
  const t = (i / 60) * (100 / radius);
  circler.x = Math.cos(t) * radius;
  circler.y = Math.sin(t) * radius - circler.h / 2;
  Wakes.follow(circler, water, 1, 1 / 60);
  Wakes.update(1 / 60);
}
drawn = [];
Wakes.draw(view, map);
const feetNow = { x: circler.x, y: circler.y + circler.h / 2 };
const inside = drawn.filter((p) => Math.hypot(p.x, p.y) < radius * 0.5 && Math.hypot(p.x - feetNow.x, p.y - feetNow.y) > circler.w && p.width > 1);
assert.strictEqual(inside.length, 0, `nothing thick inside the circle (${inside.length} bits)`);
assert(drawn.some((p) => Math.hypot(p.x, p.y) > radius * 1.5 && p.width > 1), 'the outside arm spirals out');

// going round a circle small enough that a wake's life would take it most of the way round (25 px,
// about 250 degrees a second), it only trails part of the way behind them (WAKE.turnFade), never in
// rings round the circle. how far round each bit is, behind where the feet are now
Wakes.clear();
const looper = wader();
for (let i = 0; i < 300; i++) {
  const t = (i / 60) * (100 / 25);
  looper.x = Math.cos(t) * 25;
  looper.y = Math.sin(t) * 25 - looper.h / 2;
  Wakes.follow(looper, water, 1, 1 / 60);
  Wakes.update(1 / 60);
}
drawn = [];
Wakes.draw(view, map);
const feetAngle = Math.atan2(looper.y + looper.h / 2, looper.x);
const round = Math.max(...drawn.filter((p) => p.width > 0.6).map((p) => Math.abs(game.turnBetween(Math.atan2(p.y, p.x), feetAngle))));
// well short of the whole way round (180 degrees, the most this can be)
assert(round < Math.PI * 0.8, `circling, the wake trails at most part of the way round (${((round * 180) / Math.PI).toFixed(0)} degrees)`);

// px from x, y to the line s
function toLine(x, y, s) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / length2)) : 0;
  return Math.hypot(x - s.x1 - dx * t, y - s.y1 - dy * t);
}

// steering round with the 8 way keys (a 45 degree turn every hold seconds, in circles and in a slow
// spiral), and a smooth slow spiral: every bit of wake that shows is close to where it was the frame
// before (it moves a few px a frame as it ages, never pops somewhere new), and neither arm loses a
// big part of itself in one frame (vanishing all at once). ageing loses about 1/66 of one a frame
const PATHS = {
  'round every 0.11 s': (t) => [Math.floor(t / 0.11) * (Math.PI / 4), 100],
  'round every 0.22 s': (t) => [Math.floor(t / 0.22) * (Math.PI / 4), 100],
  'a slow spiral on the keys': (t) => [Math.floor(t / 0.6) * (Math.PI / 4), 100],
  'a smooth slow spiral': (t) => [Math.log(1 + t * 0.8) * 5, 40],
};
for (const [name, path] of Object.entries(PATHS)) {
  Wakes.clear();
  const steerer = wader();
  let before = null;
  let inkBefore = null;
  let jump = 0;
  let drop = 0;
  for (let f = 0; f < 60 * 6; f++) {
    const [heading, speed] = path(f / 60);
    steerer.x += (Math.cos(heading) * speed) / 60;
    steerer.y += (Math.sin(heading) * speed) / 60;
    Wakes.follow(steerer, water, 1, 1 / 60);
    Wakes.update(1 / 60);
    drawn = [];
    segs = [];
    Wakes.draw(view, map);
    const ink = { 1: 0, '-1': 0 };
    for (const s of segs) ink[s.arm] += s.width * Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    // after the first wake's had time to build up
    if (before?.length && f > 90) {
      for (const s of segs.filter((s) => s.width > 0.6)) jump = Math.max(jump, Math.min(...before.map((b) => toLine(s.x2, s.y2, b))));
      for (const side of ['1', '-1']) if (inkBefore[side] > 20) drop = Math.max(drop, 1 - ink[side] / inkBefore[side]);
    }
    before = segs.filter((s) => s.width > 0.1);
    inkBefore = ink;
  }
  assert(jump < 7, `${name}, the wake moves at most a few px a frame (${jump.toFixed(1)} px)`);
  assert(drop < 0.2, `${name}, no arm loses much of itself in one frame (${(drop * 100).toFixed(0)}%)`);
}

// spinning round on the spot (a full turn of the keys every third of a second) after walking: the wake
// they had stays and fades like they'd stopped, rather than arms flailing round or it all going at
// once, and it counts as making one, so it doesn't turn into ripples (character.js)
Wakes.clear();
const spinner = wader();
wade(spinner, 1, 0, 100, 1);
let making = 1;
const spin = (frames) => {
  for (let f = 0; f < frames; f++) {
    const heading = Math.floor(f / 60 / 0.04) * (Math.PI / 4);
    spinner.x += (Math.cos(heading) * 100) / 60;
    spinner.y += (Math.sin(heading) * 100) / 60;
    making = Math.min(making, Wakes.follow(spinner, water, 1, 1 / 60));
    Wakes.update(1 / 60);
  }
  segs = [];
  Wakes.draw(view, map);
  return segs.filter((s) => s.width > 0.6);
};
const spinning = spin(40);
assert(spinning.some((s) => s.x2 < spinner.x - 40), 'spinning, the wake they had stays behind them');
assert(!spin(40).length, 'and fades away like they stopped');
assert(making > 0.3, `spinning counts as making a wake (${making.toFixed(2)})`);

// turning round walks back through the wake they had, rather than it vanishing all at once
Wakes.clear();
const turner = wader();
let inkBefore = 0;
let drop = 0;
for (let f = 0; f < 60 * 4; f++) {
  const heading = Math.floor(f / 60 / 0.8) * Math.PI;
  turner.x += (Math.cos(heading) * 100) / 60;
  Wakes.follow(turner, water, 1, 1 / 60);
  Wakes.update(1 / 60);
  segs = [];
  Wakes.draw(view, map);
  const ink = segs.reduce((sum, s) => sum + s.width * Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 0);
  if (f > 60 && inkBefore > 20) drop = Math.max(drop, 1 - ink / inkBefore);
  inkBefore = ink;
}
assert(drop < 0.2, `turning round, the wake doesn't vanish (${(drop * 100).toFixed(0)}% in one frame)`);

// wading slowly still makes one: the first point doesn't wait for a big step
Wakes.clear();
const slow = wader();
wade(slow, 1, 0, 30, 1);
segs = [];
Wakes.draw(view, map);
assert(segs.some((s) => s.width > 0.6), 'wading slowly makes a wake');

// a warp starts a new wake rather than one from where it was to where it is
const w = wader();
wade(w, 1, 0, 100, 0.5);
const before = Wakes.following.get(w);
w.x += TILE * 10;
wade(w, 1, 0, 100, 0.2);
assert(Wakes.following.get(w) !== before, 'warping starts a new wake');
