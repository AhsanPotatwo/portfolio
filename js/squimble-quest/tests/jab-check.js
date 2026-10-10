// checks the spear's jab (Jab in weapons.js): it reaches far, stops at the first body it touches, and
// only hits what's at its point. run it with
// node js/squimble-quest/tests/jab-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const game = { PUSH_DIRECTIONS: {}, SLIPPERY_GRIP: 10, console };
vm.createContext(game);
// const and class don't end up on game by themselves, so put the ones used here there
vm.runInContext(['config.js', 'utils.js', 'weapons.js', 'character.js'].map((f) => fs.readFileSync(`${__dirname}/../${f}`, 'utf8')).join('\n')
  + '\nthis.Character = Character; this.PLAYER = PLAYER; this.STAND_STILL = STAND_STILL; this.makeWeapon = makeWeapon;', game);
const { Character, PLAYER, STAND_STILL } = game;

// a flat endless floor with nothing in the way, like PREVIEW_FLOOR (weaponeditor.js)
const floor = { get: () => ({ speed: 1 }), colAt: () => 0, rowAt: () => 0, moveAlongX: (b, dx) => dx, moveAlongY: (b, dy) => dy, bounds: () => ({ top: -Infinity, bottom: Infinity }) };
const spearFile = JSON.parse(fs.readFileSync(`${__dirname}/../../../assets/squimble-quest/items/spear.json`, 'utf8'));
const spear = game.makeWeapon(spearFile.weapon, 'spear');

// jabs once at `at` with dummies standing at each x (on the same row unless given { x, y }), and gives
// back which got hurt
function jab(at, ...spots) {
  const body = (x, y = 0) => Object.assign(new Character(x, y, PLAYER), { hitParticles: null, die() {} });
  const jabber = body(0);
  const dummies = spots.map((s) => (typeof s === 'number' ? body(s) : body(s.x, s.y)));
  const world = { map: floor, characters: [jabber, ...dummies], arrows: [] };
  jabber.currentWeapon = () => spear;
  jabber.targets = () => dummies;
  jabber.update({ move: { x: 0, y: 0 }, aim: at, attack: true }, 1 / 60, world);
  for (let i = 0; i < 60; i++) jabber.update(STAND_STILL, 1 / 60, world);
  return dummies.map((d) => d.health < d.maxHealth);
}

const right = { x: 100, y: 0 };
assert.deepStrictEqual(jab(right, 100), [true], 'hits something near the end of its reach');
assert.deepStrictEqual(jab(right, spear.reach + 40), [false], "doesn't reach past its reach");
assert.deepStrictEqual(jab(right, 40, 90), [true, false], 'only the first in line, not the one behind');
assert.deepStrictEqual(jab(right, 90, { x: 92, y: 4 }), [true, true], 'both, when they stand together at the point');
assert.deepStrictEqual(jab({ x: 0, y: 100 }, 90), [false], 'has to be aimed, nothing off to the side');
assert(spear.reach > 62 * 1.5, 'reaches well past the sword');
