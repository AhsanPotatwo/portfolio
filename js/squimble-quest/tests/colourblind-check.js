// checks the colour blind filters' matrices (colourblind.js). run it with
// node js/squimble-quest/tests/colourblind-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const game = {};
vm.createContext(game);
vm.runInContext(`${fs.readFileSync(`${__dirname}/../colourblind.js`, 'utf8')}
this.COLOUR_BLIND_TYPES = COLOUR_BLIND_TYPES;
this.colourBlindMatrix = colourBlindMatrix;`, game);

const apply = (m, [r, g, b]) => [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const close = (a, b) => distance(a, b) < 1e-4;

// pairs each kind of colour blindness mixes up
const mixedUp = {
  protanopia: [[0.8, 0.2, 0.1], [0.2, 0.6, 0.1]],
  deuteranopia: [[0.8, 0.2, 0.1], [0.2, 0.6, 0.1]],
  tritanopia: [[0.2, 0.3, 0.9], [0.2, 0.6, 0.3]],
};

for (const [type, t] of Object.entries(game.COLOUR_BLIND_TYPES)) {
  if (!t.simulate) continue;
  assert(close(apply(game.colourBlindMatrix(type, 0), [0.3, 0.6, 0.9]), [0.3, 0.6, 0.9]), `${type} at 0 strength changes nothing`);
  for (const grey of [0, 0.4, 1]) {
    assert(close(apply(game.colourBlindMatrix(type, 1), [grey, grey, grey]), [grey, grey, grey]), `${type} keeps greys grey`);
  }
  // seen through that colour blindness, the pair is further apart with the filter than without
  const [a, b] = mixedUp[type];
  const seenAs = (m, c) => apply(t.simulate, apply(m, c));
  const before = distance(apply(t.simulate, a), apply(t.simulate, b));
  const m = game.colourBlindMatrix(type, 1);
  const after = distance(seenAs(m, a), seenAs(m, b));
  assert(after > before * 1.2, `${type} makes a mixed up pair easier to tell apart (${before.toFixed(3)} to ${after.toFixed(3)})`);
}
assert(close(apply(game.colourBlindMatrix('off', 1), [0.3, 0.6, 0.9]), [0.3, 0.6, 0.9]), 'off changes nothing');
