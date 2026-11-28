// checks liquids' surfaces (surface.js): nothing's drawn off the liquid's tiles (a wake running up
// the shore stops at it), the band under the bank is darker than the liquid, foam stays near the
// shore, and with no liquid on screen there's nothing to draw. run it with
// node js/squimble-quest/tests/surface-check.js
// no output means it all passed
const assert = require('assert');
const { load } = require('./load');

let drawnImage = 0;
let now = 0;
const game = load(['config.js', 'surface.js'], {
  millis: () => now,
  hexToRgb: (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)],
  ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); } },
  document: { createElement: () => ({ getContext: () => ({ putImageData() {} }) }) },
  drawingContext: { drawImage: () => drawnImage++ },
  Wakes: { draw() {} },
  Particles: { list: [] },
  particleAlpha: () => 0.4,
  particleSize: () => 16,
});
const { Surface, TILE, ART_SCALE } = game;
const ART = TILE / ART_SCALE;

// a 4 x 4 map with water in the middle 2 x 2
const water = { sink: 0.4, colour: '#3b7dd8', surfaceColour: '#d6ecff' };
const sand = { speed: 1 };
const map = { get: (col, row) => (col >= 0 && col < 4 && row >= 0 && row < 4 ? (col >= 1 && col <= 2 && row >= 1 && row <= 2 ? water : sand) : null) };
const edge = (half) => (half * TILE) / 2;
// every coloured px over a few seconds, by where it is (picture px from the world's 0, 0)
const seen = new Map();
for (now = 0; now < 8000; now += 100) {
  Surface.draw(map, 0, 3, 0, 3, edge, edge);
  // a wake from the middle of the water out across the sand
  Surface.line(2 * TILE, 2 * TILE, 4 * TILE, 2 * TILE, 4, 0);
  Surface.pixels.forEach((colour, i) => {
    if (!colour) return;
    const at = (Surface.ox + (i % Surface.w)) + ',' + (Surface.oy + Math.floor(i / Surface.w));
    seen.set(at, colour);
  });
}
assert(drawnImage > 0, 'it draws its layer');
assert(seen.size > 0, 'something shows on the water');
const where = [...seen.keys()].map((k) => k.split(',').map(Number));
const offWater = where.filter(([x, y]) => !map.get(Math.floor(x / ART), Math.floor(y / ART))?.sink);
assert.strictEqual(offWater.length, 0, `nothing off the water's tiles (${offWater.length} px)`);

// the band under the top bank is darker than the water
const palette = Surface.palette(water);
const brightness = (packed) => (packed & 255) + ((packed >> 8) & 255) + ((packed >> 16) & 255);
assert(brightness(palette.shade) < brightness(packed(water.colour)), 'the bank shade is darker');
assert([...seen.entries()].some(([k, c]) => c === palette.shade && Number(k.split(',')[1]) < ART + game.SURFACE.bank), 'shade under the top bank');

// foam (its whitest) only near the shore
const foam = where.filter(([x, y]) => seen.get(`${x},${y}`) === palette.foam);
const fromShore = ([x, y]) => Math.min(x - ART, 3 * ART - 1 - x, y - ART, 3 * ART - 1 - y);
assert(foam.length, 'some foam');
const far = foam.filter((p) => fromShore(p) > game.SURFACE.foamFar + 4);
assert(far.length <= 4, `foam stays near the shore, bar a glint or two (${far.length} px further out)`);

// no liquid on screen, nothing drawn
drawnImage = 0;
Surface.draw({ get: () => sand }, 0, 3, 0, 3, edge, edge);
assert.strictEqual(drawnImage, 0, 'no liquid, no layer');

function packed(hex) {
  return game.packColour(game.hexToRgb(hex));
}
