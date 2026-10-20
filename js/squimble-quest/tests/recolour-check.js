// checks the colour maths in recolour.js (hexToHsl(), hslToHex(), recolourSwaps()). run it with
// node js/squimble-quest/tests/recolour-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const game = {};
vm.createContext(game);
vm.runInContext(fs.readFileSync(`${__dirname}/../recolour.js`, 'utf8'), game);
const { hexToHsl, hslToHex, recolourSwaps } = game;

// there and back gives the same colour (to within rounding)
for (const hex of ['#fff8c8', '#e8c083', '#4f1e03', '#000000', '#ffffff', '#808080', '#3366cc']) {
  assert.strictEqual(hslToHex(...hexToHsl(hex)), hex, hex);
}

// the squimble's own picture (npcs/squimble.json)
const recolour = JSON.parse(fs.readFileSync(`${__dirname}/../../../assets/squimble-quest/npcs/squimble.json`, 'utf8')).recolour;
// its own skin gives its own colours back
for (const [from, to] of Object.entries(recolourSwaps(recolour, { skin: recolour.skin }))) assert.strictEqual(to, from);
// a picked outline is kept, and the shading still follows the skin: darker than it
const swaps = recolourSwaps(recolour, { skin: '#6fa8f0', outline: '#123456' });
assert.strictEqual(swaps[recolour.skin], '#6fa8f0');
assert.strictEqual(swaps[recolour.outline], '#123456');
assert.ok(hexToHsl(swaps[recolour.shading])[2] < hexToHsl('#6fa8f0')[2]);
