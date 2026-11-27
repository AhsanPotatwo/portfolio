// checks hud.js: hudBox() puts pieces where their anchor says, and every HUD block (config.js) has a
// function in HUD_PIECES and a real anchor. run it with node js/squimble-quest/tests/hud-check.js
// no output means it all passed
const assert = require('assert');
const { load } = require('./load');

const { hudBox, HUD, HUD_PIECES, GAME_W, GAME_H } = load(['config.js', 'hud.js']);

const piece = { x: 10, y: 20, w: 100, h: 30 };
const at = (anchor) => {
  const { x, y } = hudBox({ ...piece, anchor });
  return [x, y];
};
assert.deepStrictEqual(at('top left'), [10, 20]);
assert.deepStrictEqual(at('bottom right'), [GAME_W - 110, GAME_H - 50]);
assert.deepStrictEqual(at('bottom left'), [10, GAME_H - 50]);
assert.deepStrictEqual(at('top'), [GAME_W / 2 - 50 + 10, 20]);
assert.deepStrictEqual(at('middle'), [GAME_W / 2 - 50 + 10, GAME_H / 2 - 15 + 20]);

const ANCHORS = ['top left', 'top', 'top right', 'left', 'middle', 'right', 'bottom left', 'bottom', 'bottom right'];
for (const [name, block] of Object.entries(HUD)) {
  assert.strictEqual(typeof HUD_PIECES[name], 'function', `HUD.${name} has no function in HUD_PIECES (hud.js)`);
  assert.ok(ANCHORS.includes(block.anchor), `HUD.${name}'s anchor "${block.anchor}" isn't one of ${ANCHORS.join(', ')}`);
  const { x, y, w, h } = hudBox(block);
  assert.ok(x >= 0 && y >= 0 && x + w <= GAME_W && y + h <= GAME_H, `HUD.${name} is off the screen`);
}
