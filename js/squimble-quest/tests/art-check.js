// checks the picture maths in art.js: which row a facing picks with 4 and 8 directions, which frame a
// time picks for sheets that loop and ones that stop on their last frame, and how long one plays.
// run it with node js/squimble-quest/tests/art-check.js
// no output means it all passed
const assert = require('assert');
const { load } = require('./load');

const { artRow, artFrame, artLength } = load(['art.js']);

const down = { x: 0, y: 1 };
const up = { x: 0, y: -1 };
const left = { x: -1, y: 0 };
const right = { x: 1, y: 0 };
const downLeft = { x: -1, y: 1 };
const upRight = { x: 1, y: -1 };

// rows: down, left, right, up
const four = { directions: 4 };
assert.deepStrictEqual([down, left, right, up].map((f) => artRow(four, f)), [0, 1, 2, 3], '4 directions in order');
assert.deepStrictEqual([downLeft, upRight].map((f) => artRow(four, f)), [1, 2], 'diagonals use left and right');
// rows: clockwise from down
const eight = { directions: 8 };
const clockwise = [down, downLeft, left, { x: -1, y: -1 }, up, upRight, right, { x: 1, y: 1 }];
assert.deepStrictEqual(clockwise.map((f) => artRow(eight, f)), [0, 1, 2, 3, 4, 5, 6, 7], '8 directions clockwise from down');
assert.strictEqual(artRow({ directions: 1 }, left), 0, 'one direction is always row 0');
assert.strictEqual(artRow(four, null), 0, 'no facing is facing down');

const looping = { frames: 4, fps: 10, loop: true };
assert.deepStrictEqual([0, 0.05, 0.1, 0.35, 0.4, 0.45].map((t) => artFrame(looping, t)), [0, 0, 1, 3, 0, 0], 'a loop starts again');
const once = { frames: 4, fps: 10, loop: false };
assert.deepStrictEqual([0, 0.35, 0.4, 5].map((t) => artFrame(once, t)), [0, 3, 3, 3], 'one that stops stays on its last frame');
assert.strictEqual(artFrame(looping, -1), 0, 'before it starts is the first frame');
assert.strictEqual(artLength(once), 0.4);
assert.strictEqual(artLength({ frames: 1, fps: 8 }), 0, 'a single picture takes no time');
