// checks the dodge roll and the quick charm (Character.canRoll(), startRoll(), rollOn(), hittable()
// and bodyBox() in character.js, ROLL in config.js). run it with
// node js/squimble-quest/tests/roll-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const game = { PUSH_DIRECTIONS: {}, SLIPPERY_GRIP: 10, console, playSound: () => null, worldMap: null };
vm.createContext(game);
// const and class don't end up on game by themselves, so put the ones used here there
vm.runInContext(['config.js', 'utils.js', 'weapons.js', 'character.js'].map((f) => fs.readFileSync(`${__dirname}/../${f}`, 'utf8')).join('\n')
  + '\nthis.Character = Character; this.ROLL = ROLL; this.PLAYER = PLAYER; this.STAND_STILL = STAND_STILL; this.makeWeapon = makeWeapon;', game);
const { Character, ROLL, STAND_STILL } = game;

// a flat endless floor with nothing in the way, like PREVIEW_FLOOR (weaponeditor.js)
const floor = { get: () => ({ speed: 1 }), colAt: () => 0, rowAt: () => 0, moveAlongX: (b, dx) => dx, moveAlongY: (b, dy) => dy, bounds: () => ({ top: -Infinity, bottom: Infinity }) };
const sword = game.makeWeapon({}, 'sword');
const bow = game.makeWeapon({ attack: 'shoot' }, 'bow');
// wearing the quick charm (assets/squimble-quest/items/quick-charm.json) unless wearing is false
const charm = JSON.parse(fs.readFileSync(`${__dirname}/../../../assets/squimble-quest/items/quick-charm.json`, 'utf8'));
function character(weapon, wearing = true) {
  const c = new Character(0, 0, { ...game.PLAYER, weapon });
  c.worn = () => (wearing ? [charm] : []);
  c.world = { map: floor, characters: [c], arrows: [] };
  c.step = (controls = STAND_STILL, frames = 1) => { for (let i = 0; i < frames; i++) c.update(controls, 1 / 60, c.world); };
  return c;
}
const rollRight = { move: { x: 1, y: 0 }, aim: null, attack: false, roll: true };

// rolls the way it's walking, ducked down and unhittable at the start
const c = character(sword);
const standing = c.bodyBox();
c.step(rollRight);
assert(c.roll, 'rolls with a sword');
assert(!c.hittable(), "can't be hit at the start");
const ducked = c.bodyBox();
assert(ducked.h === standing.h * ROLL.height, 'hitbox shrinks');
assert(ducked.y + ducked.h === standing.y + standing.h, 'shrunk hitbox stays on its feet');
c.step(STAND_STILL, Math.ceil(ROLL.invincible * 60));
assert(c.roll && c.hittable(), 'hittable once the invincible bit is over, still rolling');
c.step(STAND_STILL, 60);
assert(!c.roll && c.bodyBox().h === standing.h, 'roll ends, full size again');
assert(Math.abs(c.x - ROLL.speed * ROLL.time) < ROLL.speed / 30, `goes about speed * time px, went ${c.x}`);
assert(c.y === 0, 'straight along');

// only with the charm on, whatever's in hand
const bare = character(sword, false);
bare.step(rollRight);
assert(!bare.roll, "can't roll without the charm");
const archer = character(bow);
archer.step(rollRight);
assert(archer.roll, 'rolls with a bow too');

// cooldown, then a press mid-swing is buffered and rolls after the swing
const fighter = character(sword);
fighter.step(rollRight);
fighter.step(STAND_STILL, Math.ceil(ROLL.time * 60) + 1);
fighter.step(rollRight);
assert(!fighter.roll, "can't roll again during the cooldown");
fighter.step(STAND_STILL, 60);
fighter.step({ ...STAND_STILL, attack: true });
assert(fighter.swing, 'swinging');
fighter.step(rollRight);
assert(!fighter.roll, "can't roll mid-swing");
fighter.step(STAND_STILL, Math.ceil(sword.swingTime * 60) + 1);
assert(fighter.roll, 'the press mid-swing rolls once the swing is over');

// a stagger ends a roll
const hit = character(sword);
hit.step(rollRight);
hit.stagger = 0.2;
hit.step();
assert(!hit.roll, 'stagger ends the roll');
