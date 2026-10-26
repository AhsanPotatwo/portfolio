// checks the particle effects (particles.js): every file in particles/ loads with no unknown settings,
// a ring spreads evenly, a ball goes up and down, a firework rocket goes at the top of its jump and
// bursts its bang up there in its own colour, rain splashes where it lands, an effect that makes
// itself stops at PARTICLE_CHAIN_DEPTH, colours turn to their end colour, and pull draws them in.
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
