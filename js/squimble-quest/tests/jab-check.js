// checks the spear's jab (Jab in weapons.js): it reaches far, stops at the first body it touches, and
// only hits what's at its point. run it with
// node js/squimble-quest/tests/jab-check.js
// no output means it all passed
const assert = require('assert');
const { loadFighting, FLAT_FLOOR: floor, asset } = require('./load');

const game = loadFighting();
const { Character, PLAYER, STAND_STILL } = game;

const spear = game.makeWeapon(asset('items/spear.json').weapon, 'spear');

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
