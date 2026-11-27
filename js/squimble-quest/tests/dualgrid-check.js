// checks dualgrid.js: which sheet sizes can be tilesets, and that cutDualTileset() finds the whole
// piece variants in the rows under the 4 x 4, skipping see-through spots. run it with
// node js/squimble-quest/tests/dualgrid-check.js
// no output means it all passed
const assert = require('assert');
const { load } = require('./load');

const { dualTilesetProblem, cutDualTileset } = load(['dualgrid.js'], { console: { warn: () => {} } });

const size = (width, height) => ({ width, height });
assert.strictEqual(dualTilesetProblem(size(64, 64)), null);
assert.strictEqual(dualTilesetProblem(size(128, 128)), null);
assert.strictEqual(dualTilesetProblem(size(128, 192)), null);
assert.notStrictEqual(dualTilesetProblem(size(128, 100)), null, 'a part row');
assert.notStrictEqual(dualTilesetProblem(size(128, 64)), null, 'shorter than 4 rows');
assert.notStrictEqual(dualTilesetProblem(size(130, 130)), null, 'not 4 whole pieces across');

// a 128 x 192 sheet (two rows of variants) that's solid apart from one see-through variant. get()
// gives back where it was cut from
const sheet = {
  width: 128,
  height: 192,
  pixels: new Uint8ClampedArray(128 * 192 * 4).fill(255),
  loadPixels() {},
  get: (x, y) => ({ x, y }),
};
// the variant at the second spot of the second extra row: x 32, y 160
for (let y = 160; y < 192; y++) for (let x = 32; x < 64; x++) sheet.pixels[(y * 128 + x) * 4 + 3] = 0;
const pieces = cutDualTileset(sheet, 'test');
// the 4 x 4's whole piece is in the second row, third spot (DUAL_TILESET_LAYOUT)
assert.deepStrictEqual(pieces.whole[0], { x: 64, y: 32 });
assert.strictEqual(pieces.whole.length, 1 + 7, 'the whole piece and 7 of the 8 variants');
assert.ok(!pieces.whole.some((p) => p.x === 32 && p.y === 160), 'the see-through spot is skipped');

// quarterBits(): the piece each quarter that isn't cut is drawn from, when walls (cut) hide some.
// bits are up left (8), up right (4), down left (2), down right (1), and quarters 0 to 3 the same order
const { quarterBits } = load(['dualgrid.js']);
// wall along the top, grass down left, a path down right: both draw from the straight up and down
// edge, so the grass runs straight up to the wall and none pokes into the path
assert.strictEqual(quarterBits(0b0010, 0b1100, 2), 0b1010);
assert.strictEqual(quarterBits(0b0010, 0b1100, 3), 0b1010);
// a door up right, wall up left, grass below: the door has the grass's edge under it, the grass under
// the door has the top edge, and the grass under the wall has none, so the edge stops at the door
assert.strictEqual(quarterBits(0b0011, 0b1000, 1), 0b0011);
assert.strictEqual(quarterBits(0b0011, 0b1000, 3), 0b0011);
assert.strictEqual(quarterBits(0b0011, 0b1000, 2), 0b1011);
// a wall corner poking into grass is grass all round
for (const i of [1, 2, 3]) assert.strictEqual(quarterBits(0b0111, 0b1000, i), 0b1111);
// grass in a corner of walls is whole, a path in one has none
assert.strictEqual(quarterBits(0b0001, 0b1110, 3), 0b1111);
assert.strictEqual(quarterBits(0b0000, 0b1110, 3), 0b0000);

// every dual grid tileset (tiles/dual-grid/), drawn at every corner the game can draw: each quarter
// the tile, ground, or a wall it doesn't blend onto (quarterBits()). every lump of it has to join on
// to a quarter that's the tile, and every see-through gap to a quarter that's ground, or it's a stray
// speck (like grass by a wall in a path or a door) or a hole. it goes by what's see-through, so any
// art style works
const { readPng, assetFolder, ASSETS } = require('./load');
const { DUAL_TILESET_LAYOUT } = load(['dualgrid.js']);
for (const [name, tile] of assetFolder('tiles')) {
  if (!tile.dualGrid || !tile.texture) continue;
  const sheet = readPng(`${ASSETS}tiles/dual-grid/${tile.texture}`);
  const size = sheet.w / 4;
  const half = size / 2;
  const spot = {};
  DUAL_TILESET_LAYOUT.forEach((bits, i) => (spot[bits] = [(i % 4) * size, Math.floor(i / 4) * size]));
  for (let n = 0; n < 81; n++) {
    // 0 ground, 1 the tile, 2 a wall, for up left, up right, down left, down right
    const quarters = [0, 1, 2, 3].map((i) => Math.floor(n / 3 ** i) % 3);
    let which = 0;
    let cut = 0;
    quarters.forEach((q, i) => {
      if (q === 1) which |= 0b1000 >> i;
      if (q === 2) cut |= 0b1000 >> i;
    });
    // what's drawn at each pixel: 'wall', true for the tile, false for see-through
    const at = (x, y) => {
      const i = (y >= half) * 2 + (x >= half);
      if (cut & (0b1000 >> i)) return 'wall';
      const [px, py] = spot[cut ? quarterBits(which, cut, i) : which];
      return sheet.alpha(px + x, py + y) > 0;
    };
    const seen = new Set();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const kind = at(x, y);
        if (kind === 'wall' || seen.has(y * size + x)) continue;
        // flood out through the same kind, noting if it gets into a quarter of that kind
        const quarterOf = (px, py) => quarters[(py >= half) * 2 + (px >= half)];
        let reaches = quarterOf(x, y) === (kind ? 1 : 0);
        const stack = [[x, y]];
        seen.add(y * size + x);
        while (stack.length) {
          const [cx, cy] = stack.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen.has(ny * size + nx) || at(nx, ny) !== kind) continue;
            seen.add(ny * size + nx);
            if (quarterOf(nx, ny) === (kind ? 1 : 0)) reaches = true;
            stack.push([nx, ny]);
          }
        }
        const corner = quarters.map((q) => ['ground', name, 'wall'][q]).join(', ');
        assert.ok(reaches, `${tile.texture}: a ${kind ? 'speck' : 'hole'} at ${x}, ${y} with up left, up right, down left, down right ${corner}`);
      }
    }
  }
}
