// checks the particle effects (particles.js): every file in particles/ loads with no unknown settings,
// a ring spreads evenly, a ball goes up and down, a firework rocket goes at the top of its jump and
// bursts its bang up there in its own colour, rain splashes where it lands, an effect that makes
// itself stops at PARTICLE_CHAIN_DEPTH, colours turn to their end colour, pull draws them in, and
// landing in a liquid they go in (or float), and pixel wisps fade away without ever making a plus.
// run it with node js/squimble-quest/tests/particle-check.js
// no output means it all passed
const assert = require('assert');
const { load, assetFolder } = require('./load');

const warnings = [];
// the canvas bits particles.js touches when it loads. nothing gets drawn here
class Path2D { lineTo() {} moveTo() {} arc() {} ellipse() {} bezierCurveTo() {} closePath() {} }
const game = load(['utils.js', 'datafiles.js', 'particles.js'], { console: { warn: (w) => warnings.push(w) }, Path2D, radians: (d) => (d * Math.PI) / 180, loadImage: () => ({}) });
const { ParticleSystem, PARTICLE_EFFECTS, PARTICLE_CHAIN_DEPTH, defineParticles, particleRgb } = game;

// every effect file loads, with no typo'd settings
for (const [name, settings] of assetFolder('particles')) defineParticles(name, settings);
assert.deepStrictEqual(warnings, []);
const effect = (settings) => ({ ...PARTICLE_EFFECTS.blood, countRandom: 0, speedRandom: 0, jumpRandom: 0, lifetimeRandom: 0, area: 0, ...settings });
const run = (system, seconds, until = () => false) => {
  for (let t = 0; t < seconds && !until(); t += 1 / 60) system.update(1 / 60, null);
};

// a ring of 8 all round goes out 45° apart
const ring = new ParticleSystem();
ring.burst(effect({ count: 8, pattern: 'ring' }), 0, 0);
const headings = ring.list.map((p) => Math.atan2(p.vy, p.vx)).sort((a, b) => a - b);
headings.slice(1).forEach((h, i) => assert(Math.abs(h - headings[i] - Math.PI / 4) < 1e-9));

// a ball with no jump goes up and down, all at Speed
const ball = new ParticleSystem();
ball.burst(effect({ count: 200, pattern: 'ball', jumpHeight: 0, speed: 100 }), 0, 0, { height: 50 });
assert(ball.list.some((p) => p.vz > 50) && ball.list.some((p) => p.vz < -50));
ball.list.forEach((p) => assert(Math.abs(Math.hypot(p.vx, p.vy, p.vz) - 100) < 1e-6));

// a firework goes at the top of its jump and bangs up there in its colour
const sky = new ParticleSystem();
sky.burst('firework', 0, 0);
const rocket = sky.list[0];
run(sky, 5, () => !sky.list.includes(rocket));
// going early runs its life out, so it's where it went that shows it went at the top
assert(!sky.list.includes(rocket) && rocket.z > 50 && Math.abs(rocket.vz) < 10, 'the rocket goes at its peak');
const bang = sky.list.filter((p) => p.effect === PARTICLE_EFFECTS['firework-bang']);
assert(bang.length > 40, 'it bangs');
bang.forEach((p) => {
  assert(p.z > 50, 'up in the air');
  assert.deepStrictEqual(p.rgb, rocket.rgb);
});
assert(sky.list.some((p) => p.effect === PARTICLE_EFFECTS['firework-trail'] && p.rgb === rocket.rgb), 'it trails in its colour');

// rain goes when it lands and splashes there
const wet = new ParticleSystem();
wet.burst('rain', 0, 0);
run(wet, 2, () => wet.list.some((p) => p.effect === PARTICLE_EFFECTS['rain-splash']));
assert(wet.list.every((p) => p.effect === PARTICLE_EFFECTS['rain-splash']), 'the drop is gone');

// an effect whose then is itself stops after PARTICLE_CHAIN_DEPTH
PARTICLE_EFFECTS.forever = effect({ count: 1, lifetime: 0.1, then: 'forever' });
const loop = new ParticleSystem();
loop.burst('forever', 0, 0);
run(loop, 2);
assert.strictEqual(loop.list.length, 0);
let deepest = 0;
loop.burst('forever', 0, 0);
for (let i = 0; i < 60; i++) {
  loop.update(1 / 60, null);
  for (const p of loop.list) deepest = Math.max(deepest, p.depth);
}
assert.strictEqual(deepest, PARTICLE_CHAIN_DEPTH);

// halfway through its life it's turned halfway to its end colour
const fade = new ParticleSystem();
fade.burst(effect({ count: 1, colour: '#000000', colour2: '#000000', endColour: '#ffffff', colourChange: 100, lifetime: 1 }), 0, 0);
fade.list[0].age = 0.5;
assert.deepStrictEqual([...particleRgb(fade.list[0])], [128, 128, 128]);

// pull brings them in from the edge of the start area
const magic = new ParticleSystem();
magic.burst(effect({ count: 20, area: 100, speed: 0, jumpHeight: 0, gravity: 0, startHeight: 10, pull: 300, airDrag: 3, lifetime: 5 }), 0, 0);
const spread = () => Math.max(...magic.list.map((p) => Math.hypot(p.x, p.y)));
const before = spread();
run(magic, 1.5);
assert(spread() < before / 2, 'pulled in');

// landing in a liquid they go in (fallIn()): a splash on the surface where they went in, then gone,
// unless they float. sliding off the shore goes in too. ripples (onLiquid) stay. the map is water
// right of x = 0 and sand left of it, with no walls
const splashes = [];
game.Surface = { splash: (p, liquid) => splashes.push({ x: p.x, liquid }) };
game.TILE = 32;
const water = { sink: 0.4, colour: '#3b7dd8' };
const pond = { colAt: (x) => Math.floor(x / 32), rowAt: (y) => Math.floor(y / 32), get: (col) => (col >= 0 ? water : {}), isSolid: () => false };
const landIn = (settings, x, vx = 0, seconds = 1, waders = []) => {
  const system = new ParticleSystem();
  system.burst(effect({ count: 1, speed: 0, lifetime: 60, ...settings }), x, 0);
  system.list[0].vx = vx;
  for (let t = 0; t < seconds; t += 1 / 60) system.update(1 / 60, pond, typeof waders === 'function' ? waders(t) : waders);
  return system.list;
};
assert.strictEqual(landIn({ jumpHeight: 20, inLiquid: 'sinks' }, 50).length, 0, 'sinks out of sight');
assert(splashes.length === 1 && splashes[0].liquid === water, 'with a splash where it went in');
assert.strictEqual(landIn({ jumpHeight: 20, inLiquid: 'dissolves' }, 50).length, 0, 'spreading through it, it goes too');
const floats = { jumpHeight: 20, inLiquid: 'floats', bounce: 50, floatBob: 1, floatDrift: 20, floatPush: 100, floatSoak: 0 };
const floater = landIn(floats, 50, 0, 3);
assert(floater.length === 1 && floater[0].floating === water, 'floats on it');
assert(floater[0].z <= 0 && floater[0].z >= -2 * (1 + game.PARTICLE_FLOAT.jostle), `bobbing at the surface (z ${floater[0].z.toFixed(2)})`);
// drifting about for a long while it never leaves the water
const drifter = landIn(floats, 4, 0, 20);
assert(drifter.length === 1 && drifter[0].floating && drifter[0].x >= 0, `drifting, it stays on the water (x ${drifter[0].x.toFixed(1)})`);
// someone wading right past it shoves it on ahead of them and sets it bobbing
const shoved = landIn({ ...floats, floatDrift: 0 }, 60, 0, 2.5, (t) => (t > 1 ? [{ x: 30 + (t - 1) * 60, y: 0, vx: 60, vy: 0, r: 21 }] : []));
assert(shoved[0].x > 70, `a wader shoves it along (x ${shoved[0].x.toFixed(1)})`);
const still = landIn({ ...floats, floatDrift: 0, floatPush: 0 }, 60, 0, 2.5, (t) => (t > 1 ? [{ x: 30 + (t - 1) * 60, y: 0, vx: 60, vy: 0, r: 21 }] : []));
assert(Math.abs(still[0].x - 60) < 2, `with no push it stays put (x ${still[0].x.toFixed(1)})`);
// soaking it goes under after floatSoak seconds
splashes.length = 0;
assert.strictEqual(landIn({ ...floats, floatSoak: 2 }, 50, 0, 3).length, 0, 'soaked through, it sinks');
assert.strictEqual(splashes.length, 2, 'with a ring going in and another going under');
assert.strictEqual(landIn({ jumpHeight: 20 }, -50).length, 1, 'on the sand it lies there as always');
splashes.length = 0;
assert.strictEqual(landIn({ jumpHeight: 0, floorFriction: 0 }, -10, 120).length, 0, 'sliding off the shore it falls in');
assert(splashes.length === 1 && splashes[0].x >= 0, 'with its splash in the water');
assert.strictEqual(landIn({ jumpHeight: 5, onLiquid: true }, 50).length, 1, 'ripples (onLiquid) stay on it');

// hot liquids (lava, a tile's hot): sizzling it's gone at once, bursting its hotThen there; burning it
// floats, shrinks away over burnTime making its hotThen as it goes, then it's gone; the same as in
// liquids ignores the heat. any particle landing bursts the liquid's landParticles
const lava = { sink: 0.3, colour: '#e4572e', surfaceColour: '#ffd23f', hot: true };
const lavaPond = { ...pond, get: (col) => (col >= 0 ? lava : {}) };
const inLava = (settings, seconds) => {
  const system = new ParticleSystem();
  system.burst(effect({ count: 1, speed: 0, jumpHeight: 20, lifetime: 60, ...settings }), 50, 0);
  for (let t = 0; t < seconds; t += 1 / 60) system.update(1 / 60, lavaPond);
  return system.list;
};
const steamy = inLava({ inHot: 'sizzles', hotThen: 'sizzle-steam' }, 0.6);
assert(steamy.length && steamy.every((p) => p.effect === PARTICLE_EFFECTS['sizzle-steam']), 'sizzling, it goes and steams');
const burner = new ParticleSystem();
burner.burst(effect({ count: 1, speed: 0, jumpHeight: 20, lifetime: 60, inHot: 'burns', hotThen: 'burn-smoke', burnTime: 1 }), 50, 0);
const burning = burner.list[0];
for (let t = 0; t < 0.6; t += 1 / 60) burner.update(1 / 60, lavaPond);
assert(burner.list.includes(burning) && burning.floating === lava && burning.shrink < 1 && burning.shrink > 0, 'burning, it sits on top shrinking');
assert(burner.list.some((p) => p.effect === PARTICLE_EFFECTS['burn-smoke']), 'and smokes');
for (let t = 0; t < 1; t += 1 / 60) burner.update(1 / 60, lavaPond);
assert(!burner.list.includes(burning), 'then it has burnt up');
assert.strictEqual(inLava({ inHot: 'same', inLiquid: 'floats' }, 1).filter((p) => p.floating && p.burning === undefined).length, 1, 'the same as in liquids ignores the heat');
const puffed = new ParticleSystem();
puffed.burst(effect({ count: 1, speed: 0, jumpHeight: 20, lifetime: 60 }), 50, 0);
for (let t = 0; t < 0.6; t += 1 / 60) puffed.update(1 / 60, { ...pond, get: (col) => (col >= 0 ? { ...water, landParticles: ['smoke'] } : {}) });
assert(puffed.list.some((p) => p.effect === PARTICLE_EFFECTS.smoke), "anything landing bursts the liquid's landParticles");

// pixel wisps (wispRuns()): a whole one is a solid lump round its middle, it loses px as it fades and
// is gone at the end, and never shows a little plus on its own (it'd read as a sparkle). they use
// surface.js's hash, so they get a sandbox of their own with it
const wisps = load(['config.js', 'utils.js', 'datafiles.js', 'particles.js', 'surface.js'], { Path2D, radians: (d) => (d * Math.PI) / 180, loadImage: () => ({}) });
const wispPixels = (r, gone, seed, time = 0) => {
  const on = new Set();
  wisps.wispRuns(r, r * 1.1, gone, seed, time, (dx, dy, length) => {
    for (let i = 0; i < length; i++) on.add(`${dx + i},${dy}`);
  });
  return on;
};
const whole = wispPixels(4, 0, 5);
assert(whole.has('0,0') && whole.size > 30, `a whole wisp is a lump (${whole.size} px)`);
assert([...whole].every((k) => k.split(',').every((v) => Math.abs(v) <= 4 * 1.1 * 1.6 + 1)), 'all round its middle');
assert(wispPixels(4, 0.6, 5).size < whole.size, 'fading, it loses px');
assert.strictEqual(wispPixels(4, 1, 5).size, 0, 'faded, it is gone');
const plus = (on) => [...on].some((k) => {
  const [x, y] = k.split(',').map(Number);
  const at = (dx, dy) => on.has(`${x + dx},${y + dy}`);
  const arms = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // a middle with all four arms, and nothing else touching any of it
  if (!arms.every(([dx, dy]) => at(dx, dy))) return false;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const part = (dx === 0 && Math.abs(dy) <= 1) || (dy === 0 && Math.abs(dx) <= 1);
    if (!part && Math.abs(dx) + Math.abs(dy) <= 2 && at(dx, dy)) return false;
  }
  return true;
});
let pluses = 0;
for (let seed = 0; seed < 60; seed++) for (const r of [1, 1.5, 2, 3, 5]) for (const gone of [0, 0.3, 0.6, 0.85]) if (plus(wispPixels(r, gone, seed, seed * 0.1))) pluses++;
assert.strictEqual(pluses, 0, `no wisp shows a little plus (${pluses})`);
