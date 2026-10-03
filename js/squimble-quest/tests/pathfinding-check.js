// checks the enemy pathfinder (pathfinding.js) on tiny drawn maps: node js/squimble-quest/tests/pathfinding-check.js
// # wall, . floor, L lava, S spikes, E enemy, P player. no output = all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// the real lava and spikes from tiles.json, filled like TILE_DEFAULTS
const tile = (name, settings) => ({ name, solid: false, speed: 1, damagePerStep: 0, damagePerSecond: 0, ...settings });
const TILE_TYPES = {
  '#': tile('wall', { solid: true }),
  '.': tile('floor'),
  L: tile('lava', { speed: 0.7, damagePerSecond: 25 }),
  S: tile('spikes', { damagePerStep: 15 }),
};
const game = { TILE: 32, TILE_TYPES };
vm.createContext(game);
vm.runInContext(fs.readFileSync(`${__dirname}/../pathfinding.js`, 'utf8'), game);

// enough of a TileMap (tilemap.js) for planPath()
function plan(rows, caution, health = 60, crowd) {
  const cols = rows[0].length;
  const tiles = rows.join('').replace(/[EP]/g, '.');
  const at = (ch) => ({ col: rows.join('').indexOf(ch) % cols, row: Math.floor(rows.join('').indexOf(ch) / cols) });
  const map = {
    left: 0, top: 0, cols,
    index: (c, r) => r * cols + c,
    get: (c, r) => (c >= 0 && r >= 0 && c < cols && r < rows.length ? TILE_TYPES[tiles[r * cols + c]] : null),
    isSolid(c, r) { const t = this.get(c, r); return !t || t.solid; },
  };
  const enemy = { speed: 95, health, maxHealth: 60 };
  const e = at('E');
  const p = at('P');
  const result = game.planPath(map, enemy, e.col, e.row, p.col, p.row, caution, crowd);
  result.tiles = result.path.map(({ col, row }) => tiles[row * cols + col]).join('');
  return result;
}

// walks round a wall
const wall = plan([
  '.......',
  '.E.#.P.',
  '...#...',
  '.......',
], 0.15);
assert(wall.reached && !wall.tiles.includes('#'), 'goes round the wall');

// fork of equal length, lava on one side: takes the safe side
const fork = plan([
  '#######',
  '#.....#',
  '#E###P#',
  '#..L..#',
  '#######',
], 0.15);
assert(fork.reached && fork.damage === 0, 'picks the safe side of a fork');

// one spike, or 12 tiles further round
const spikeOrDetour = [
  '#################',
  '#...............#',
  '###.#########.###',
  '###.#########.###',
  '###.#########.###',
  '###.#########.###',
  '###.#########.###',
  '###E....S....P###',
  '#################',
];
assert.strictEqual(plan(spikeOrDetour, 0.15).damage, 15, 'smart takes one spike over a long walk');
assert.strictEqual(plan(spikeOrDetour, 0.5).damage, 0, 'careful walks round');
assert.strictEqual(plan(spikeOrDetour, 0).damage, 15, 'reckless takes the shortest');
// hurt: fear makes even smart walk round
assert.strictEqual(plan(spikeOrDetour, 0.15, 20).damage, 0, 'hurt smart walks round');

// lava that would kill: a wall, so no way
const lethal = plan([
  '#######',
  '#ELLLP#',
  '#######',
], 0, 30);
assert(!lethal.reached && !lethal.tiles.includes('L'), "won't walk to its death");
assert(plan(['#######', '#ELLLP#', '#######'], 0, 60).reached, 'crosses when it would survive');

// no diagonal step past lava at the corner: (1,1) → (2,2) would brush (1,2)
const corner = plan([
  '#####',
  '#E..#',
  '#L..#',
  '#.P.#',
  '#####',
], 0.15);
assert(corner.path[0].col === 2 && corner.path[0].row === 1, 'steps round a lava corner');
assert.strictEqual(corner.damage, 0);

// crowd: an ally expected along the top of a fork sends it along the bottom
const forkRows = [
  '#######',
  '#.....#',
  '#E###P#',
  '#.....#',
  '#######',
];
const ally = new Map([[1 * 7 + 2, 1], [1 * 7 + 3, 0.6], [1 * 7 + 4, 0.4]]);
assert(plan(forkRows, 0.15, 60, ally).path.every(({ row }) => row >= 2), 'goes the other way round an ally');
// someone parked in a doorway: goes round by the other door
const door = plan([
  '#.#.#.###',
  '#.......#',
  '#.#.#.###',
  '#E#....P#',
  '#.#.#.###',
], 0.15, 60, new Map([[2 * 9 + 3, 4]]));
assert(door.reached && !door.path.some(({ col, row }) => col === 3 && row === 2), 'goes round someone parked in a door');

// right of way (goesFirst()): exactly one of two stuck enemies goes first, so they always agree
const near = { plan: { path: [{}] } };
const far = { plan: { path: [{}, {}] } };
const tie = { plan: { path: [{}] } };
const idle = {};
const world = { enemies: [far, near, tie] };
assert(game.goesFirst(near, far, world) && !game.goesFirst(far, near, world), 'nearer its goal goes first');
assert(game.goesFirst(near, tie, world) !== game.goesFirst(tie, near, world), 'a tie still has one going first');
assert(game.goesFirst(idle, near, world), "anyone without a plan goes first, since it won't step aside");
