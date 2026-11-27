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
