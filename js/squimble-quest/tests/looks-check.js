// checks looks.js: the colour maths (hexToHsl(), hslToHex(), recolourSwaps()) and the part files in
// assets/squimble-quest/parts/ (each in a real slot, its picture there, its recolour colours real
// colours, and parts in the same colour group with the same recolour list). run it with
// node js/squimble-quest/tests/looks-check.js
// no output means it all passed
const fs = require('fs');
const assert = require('assert');
const { load, assetFolder } = require('./load');

const { hexToHsl, hslToHex, recolourSwaps, LOOK_SLOTS } = load(['looks.js'], { DataFiles: { register: () => {} } });

// there and back gives the same colour (to within rounding)
for (const hex of ['#fff8c8', '#e8c083', '#4f1e03', '#000000', '#ffffff', '#808080', '#3366cc']) {
  assert.strictEqual(hslToHex(...hexToHsl(hex)), hex, hex);
}

const root = `${__dirname}/../../..`;
const parts = assetFolder('parts').map(([name, settings]) => ({ name, ...settings }));
const groups = {};
for (const part of parts) {
  assert.ok(LOOK_SLOTS.includes(part.slot), `${part.name}'s slot "${part.slot}" isn't in LOOK_SLOTS`);
  assert.ok(fs.existsSync(`${root}/${part.image}`), `${part.name}'s picture ${part.image} isn't there`);
  if (!part.recolour) continue;
  for (const hex of Object.values(part.recolour)) assert.match(hex, /^#[0-9a-f]{6}$/i, `${part.name} has a recolour colour "${hex}"`);
  // a part's own colours with nothing picked come back as they are
  for (const [from, to] of Object.entries(recolourSwaps(part.recolour, {}))) assert.strictEqual(to, from, part.name);
  const group = part.colours ?? part.slot;
  groups[group] ??= part;
  assert.deepStrictEqual(part.recolour, groups[group].recolour, `${part.name} and ${groups[group].name} share the "${group}" colours, so they need the same recolour list`);
}

// a picked colour is used as it is, and an unpicked one follows the main one: the squimble's shading
// stays darker than its skin on a blue skin
const skin = parts.find((part) => part.name === 'squimble-body').recolour;
const swaps = recolourSwaps(skin, { skin: '#6fa8f0', outline: '#123456' });
assert.strictEqual(swaps[skin.skin], '#6fa8f0');
assert.strictEqual(swaps[skin.outline], '#123456');
assert.ok(hexToHsl(swaps[skin.shading])[2] < hexToHsl('#6fa8f0')[2]);
