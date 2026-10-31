// checks liquids (a tile's sink and the rest in tiles.js, Character.inLiquid() in character.js,
// LIQUID in config.js): sinking in eases, one splash stepping in however many tiles you wade
// through, a wake walking and ripples standing, coming back out, and starting in one without a
// splash. run it with node js/squimble-quest/tests/liquid-check.js
// no output means it all passed
const assert = require('assert');
const { loadFighting } = require('./load');

const bursts = [];
const played = [];
const followed = new Set();
// how much wake Wakes.follow() says it's making
let waking = 1;
const game = loadFighting({
  Particles: { burst: (effect) => bursts.push(effect) },
  Wakes: { follow: (owner) => followed.add(owner) && waking },
  SOUNDS: { splash: { name: 'splash' } },
  playSound: (sound) => played.push(sound.name),
});
const { Character, TILE, STAND_STILL } = game;

const ground = { speed: 1 };
const water = { speed: 1, sink: 0.4, splashParticles: ['drops'], rippleParticles: ['ring'], splashSounds: ['splash'] };
// ground left of x = 2 tiles, water from there on
const map = {
  get: (col) => (col >= 2 ? water : ground),
  colAt: (x) => Math.floor(x / TILE),
  rowAt: (y) => Math.floor(y / TILE),
  moveAlongX: (b, dx) => dx,
  moveAlongY: (b, dy) => dy,
  bounds: () => ({ top: -Infinity, bottom: Infinity }),
};
function wader(x) {
  const c = new Character(x, 0, { ...game.PLAYER, weapon: null });
  c.worn = () => [];
  c.world = { map, characters: [c], arrows: [] };
  c.step = (controls, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) c.update(controls, 1 / 60, c.world); };
  return c;
}
const count = (list, name) => list.filter((n) => n === name).length;
const right = { ...STAND_STILL, move: { x: 1, y: 0 } };
const left = { ...STAND_STILL, move: { x: -1, y: 0 } };

// walking in from the ground: it eases in, and splashes once over several tiles of water
const c = wader(TILE);
c.step(STAND_STILL, 0.1);
assert.strictEqual(c.sink, 0, 'on the ground nothing sinks');
c.step(right, 0.3);
assert(c.sink > 0 && c.sink < 0.4, `sinking in eases rather than snapping (sink ${c.sink})`);
c.step(right, 1);
assert(c.x > 5 * TILE, 'it waded across several tiles');
assert(Math.abs(c.sink - 0.4) < 0.01, `it settles at the tile's sink (${c.sink})`);
assert.strictEqual(count(bursts, 'drops'), 1, 'one splash stepping in, none tile to tile');
assert.deepStrictEqual(played, ['splash'], 'one splash sound');

// ripples: none walking, where the wake is (wakes.js), one just after stopping, then every so often
bursts.length = 0;
c.step(right, 2);
assert.strictEqual(count(bursts, 'ring'), 0, 'no ripples walking');
assert(followed.has(c), 'walking in water makes a wake');
c.step(STAND_STILL, game.LIQUID.rippleStopping + 0.05);
assert.strictEqual(count(bursts, 'ring'), 1, 'a ripple just after stopping');
c.step(STAND_STILL, 3);
assert(count(bursts, 'ring') >= 3, `ripples standing (${count(bursts, 'ring')})`);
// moving without making a wake (spinning on the spot, or a liquid with none) ripples instead, more
// often than standing
waking = 0;
bursts.length = 0;
c.step(left, 2);
assert(count(bursts, 'ring') >= 3, `ripples moving with no wake (${count(bursts, 'ring')})`);
waking = 1;

// back out onto the ground: it comes out, and remembers what it was in for drawing that
while (c.x > TILE) c.step(left, 0.1);
c.step(STAND_STILL, 1);
assert(c.x < 2 * TILE && c.sink < 0.01, `out of the water it comes out (sink ${c.sink})`);
assert.strictEqual(c.liquid, water, 'it still knows the liquid it came out of');
bursts.length = 0;
c.step(right, 0.5);
assert.strictEqual(count(bursts, 'drops'), 1, 'stepping back in splashes again');

// starting in water (spawning there): already in, and no splash
bursts.length = 0;
const spawned = wader(4 * TILE);
spawned.step(STAND_STILL, 1 / 60);
assert.strictEqual(spawned.sink, 0.4, 'starting in water is already sunk in');
assert.strictEqual(count(bursts, 'drops'), 0, 'starting in water makes no splash');

// the shore (Character.depthAt()): half on the sand from the side, it doesn't sink at all
const half = game.PLAYER.width / 2;
const side = wader(2 * TILE + half - 4);
side.step(STAND_STILL, 1);
assert.strictEqual(side.tile, water, 'its feet are in the water');
assert.strictEqual(side.sink, 0, `with part of it over the sand it doesn't sink (sink ${side.sink})`);
// whole width just in, it's only a little way in, deeper further from the shore
side.x = 2 * TILE + half + 6;
side.step(STAND_STILL, 1);
const shallow = side.sink;
side.x = 2 * TILE + half + 18;
side.step(STAND_STILL, 1);
assert(shallow > 0 && shallow < side.sink && side.sink < 0.4, `a beach, deeper further in (${shallow}, then ${side.sink})`);

// a pond with sand below row 3 (and left of col 2): coming in from the bottom it's never deeper than
// the water goes below its feet, or it'd look sunk into the sand
const pond = { ...map, get: (col, row) => (row < 3 && col >= 2 ? water : ground) };
const fromBelow = wader(6 * TILE);
fromBelow.world.map = pond;
fromBelow.y = 3 * TILE - 4 - fromBelow.h / 2;
fromBelow.step(STAND_STILL, 1);
assert(fromBelow.tile === water && fromBelow.sink * fromBelow.h <= 4.01, `4 px from the bottom shore it's at most 4 px in (${fromBelow.sink * fromBelow.h})`);
fromBelow.y -= 2 * TILE;
fromBelow.step(STAND_STILL, 1);
assert(Math.abs(fromBelow.sink - 0.4) < 0.01, `well in, it's all the way in (${fromBelow.sink})`);
// in the bottom left corner it's shallow both ways
fromBelow.x = 2 * TILE + half + 12;
fromBelow.y = 3 * TILE - 12 - fromBelow.h / 2;
fromBelow.step(STAND_STILL, 1);
assert(fromBelow.sink * fromBelow.h <= 12.01 && fromBelow.sink < 0.4 * 12 / 24 + 0.01, `shallow in the corner (${fromBelow.sink * fromBelow.h} px)`);
