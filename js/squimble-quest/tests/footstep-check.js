// checks footsteps (Character.footstep() in character.js, FOOTSTEPS in config.js, a tile's
// stepSounds in tiles.js): one a stride, the first one quickly, from the tile's sounds without the
// same one twice in a row, none walking into a wall, quieter for others, none out of earshot. run it
// with node js/squimble-quest/tests/footstep-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const played = [];
// heard is how loud Sound.volumeAt() says it is
const game = { PUSH_DIRECTIONS: {}, SLIPPERY_GRIP: 10, console, worldMap: null, heard: 1 };
game.playSound = (sound, at, key, options) => played.push({ name: sound.name, at, ...options });
game.Sound = { volumeAt: () => game.heard };
game.SOUNDS = { a: { name: 'a', range: 6 }, b: { name: 'b', range: 6 }, c: { name: 'c', range: 6 } };
vm.createContext(game);
vm.runInContext(['config.js', 'utils.js', 'weapons.js', 'character.js'].map((f) => fs.readFileSync(`${__dirname}/../${f}`, 'utf8')).join('\n')
  + '\nthis.Character = Character; this.FOOTSTEPS = FOOTSTEPS; this.PLAYER = PLAYER; this.STAND_STILL = STAND_STILL;', game);
const { Character, FOOTSTEPS, STAND_STILL } = game;

// an endless floor of one tile, with nothing in the way unless wall is true
const tile = { speed: 1, stepSounds: ['a', 'b', 'c'], stepVolume: 1, stepPitch: 1, stepPitchVariety: 0.1, stepRange: 0 };
let wall = false;
const floor = { get: () => tile, colAt: () => 0, rowAt: () => 0, moveAlongX: (b, dx) => (wall ? 0 : dx), moveAlongY: (b, dy) => (wall ? 0 : dy), bounds: () => ({ top: -Infinity, bottom: Infinity }) };
function walker(mine = true) {
  const c = new Character(0, 0, { ...game.PLAYER, weapon: null });
  c.camera = mine ? {} : null;
  c.worn = () => [];
  c.world = { map: floor, characters: [c], arrows: [] };
  c.step = (controls, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) c.update(controls, 1 / 60, c.world); };
  return c;
}
const right = { move: { x: 1, y: 0 }, aim: null, attack: false };

// a second of walking is speed / stride steps, give or take the first one coming early
const you = walker();
you.step(right, 1);
const expected = (game.PLAYER.speed + FOOTSTEPS.stride * FOOTSTEPS.firstStep) / FOOTSTEPS.stride;
assert(Math.abs(played.length - expected) <= 1, `about ${expected.toFixed(1)} steps a second, got ${played.length}`);
for (let i = 1; i < played.length; i++) assert(played[i].name !== played[i - 1].name, 'never the same sound twice in a row');
assert(played.every((p) => p.volume === 1 && p.doppler === 0 && p.rate >= 0.9 && p.rate <= 1.1), 'full volume, no doppler, pitch within 10%');

// the first step comes within (1 - firstStep) of a stride of starting again
played.length = 0;
you.step(STAND_STILL, 0.5);
you.step(right, (FOOTSTEPS.stride * (1 - FOOTSTEPS.firstStep)) / game.PLAYER.speed + 0.02);
assert.strictEqual(played.length, 1, 'first step comes quickly');

// silent walking into a wall, with one sound, for others quieter, and out of earshot not at all
played.length = 0;
wall = true;
you.step(right, 1);
assert.strictEqual(played.length, 0, 'walking into a wall makes no steps');
wall = false;
tile.stepSounds = ['a'];
you.step(right, 1);
assert(played.length > 2 && played.every((p) => p.name === 'a'), 'one sound plays every step');
played.length = 0;
walker(false).step(right, 1);
assert(played.length > 2 && played.every((p) => p.volume === FOOTSTEPS.othersVolume), "others' steps are quieter");
played.length = 0;
game.heard = 0;
walker(false).step(right, 1);
assert.strictEqual(played.length, 0, 'none out of earshot');
