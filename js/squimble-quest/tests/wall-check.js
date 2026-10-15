// checks walls 1 tile thick stop everything they should: the sword, axe and spear can't hit through
// one (MeleeSwing.clearTo() in weapons.js), a hard shove on a slow frame can't skip over one
// (moveAlongX() and moveAlongY() in tilemap.js), and you can't talk to an npc through one
// (Dialogue.npcInRange()). run it with
// node js/squimble-quest/tests/wall-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const game = { PUSH_DIRECTIONS: {}, SLIPPERY_GRIP: 10, console, playSound: () => null, worldMap: null, ENEMY_TYPES: {}, NPC_TYPES: {}, UIElement: class {},
  constrain: (v, lo, hi) => Math.min(hi, Math.max(lo, v)), radians: (d) => d * Math.PI / 180 };
game.TILE_TYPES = { floor: { speed: 1 }, wall: { speed: 1, solid: true } };
vm.createContext(game);
// const and class don't end up on game by themselves, so put the ones used here there
vm.runInContext(['config.js', 'utils.js', 'weapons.js', 'character.js', 'tilemap.js', 'dialogue.js'].map((f) => fs.readFileSync(`${__dirname}/../${f}`, 'utf8')).join('\n')
  + '\nthis.Character = Character; this.PLAYER = PLAYER; this.STAND_STILL = STAND_STILL; this.makeWeapon = makeWeapon; this.TileMap = TileMap; this.Dialogue = Dialogue; this.standingOnTile = standingOnTile; this.TILE = TILE; this.MAX_DT = MAX_DT;', game);
const { Character, PLAYER, STAND_STILL, TileMap, Dialogue, TILE } = game;

// 12 x 12 of floor with a wall down column 5 and along row 8, or no wall
function makeMap(wall) {
  const map = new TileMap(0, 0, 12, 12, 'floor');
  for (let i = 0; i < 12; i++) {
    if (wall) map.tiles[map.index(5, i)] = map.tiles[map.index(i, 8)] = 'wall';
  }
  return map;
}
// in row 2, with the feet right up against the wall on the left (x 160) or right (x 192) of it
const left = 5 * TILE - PLAYER.feetWidth / 2;
const right = 6 * TILE + PLAYER.feetWidth / 2;
const y = game.standingOnTile(PLAYER, 0, 2).y;
const body = (x) => Object.assign(new Character(x, y, PLAYER), { hitParticles: null, die() {} });

// attacks once from the left of the wall at a dummy on the right, and says if it got hurt
function hurts(name, wall) {
  const file = JSON.parse(fs.readFileSync(`${__dirname}/../../../assets/squimble-quest/items/${name}.json`, 'utf8'));
  const weapon = game.makeWeapon(file.weapon, name);
  const map = makeMap(wall);
  const attacker = body(left);
  const dummy = body(right);
  const world = { map, characters: [attacker, dummy], arrows: [] };
  attacker.currentWeapon = () => weapon;
  attacker.targets = () => [dummy];
  attacker.update({ move: { x: 0, y: 0 }, aim: { x: dummy.x, y: dummy.y }, attack: true }, 1 / 60, world);
  for (let i = 0; i < 60; i++) {
    attacker.update(STAND_STILL, 1 / 60, world);
    // a jab's point stops at the wall
    if (wall && attacker.swing?.tip !== undefined) assert(attacker.x + attacker.swing.tip < 5 * TILE + TILE / 2, `the ${name} pokes through the wall`);
  }
  return dummy.health < dummy.maxHealth;
}
for (const name of ['sword', 'axe', 'spear']) {
  assert(hurts(name, false), `the ${name} reaches across with no wall`);
  assert(!hurts(name, true), `the ${name} hits through a 1 tile wall`);
}

// the hardest knockback the editor allows, on the slowest frame (MAX_DT), stops at the wall
const pushed = body(left);
const world = { map: makeMap(true), characters: [pushed], arrows: [] };
pushed.pushTowards(0, 1500, true);
for (let i = 0; i < 10; i++) pushed.update(STAND_STILL, game.MAX_DT, world);
assert(pushed.x <= left + 0.001, 'knocked through the wall sideways');
const above = { x: 32, y: 8 * TILE - 10, w: 24, h: 10 };
assert.strictEqual(world.map.moveAlongY(above, 75), 0, 'knocked through the wall downwards');
assert.strictEqual(world.map.moveAlongY(above, 5), 0, 'small moves still stop at it');
assert.strictEqual(makeMap(false).moveAlongY(above, 75), 75, 'moves all the way with no wall');

// talking: in range across the wall's width, but not through it
const npc = body(right);
const you = body(left);
assert.strictEqual(Dialogue.npcInRange(you, [npc], makeMap(false)), npc, 'talks with no wall');
assert.strictEqual(Dialogue.npcInRange(you, [npc], makeMap(true)), null, 'talks through a wall');
