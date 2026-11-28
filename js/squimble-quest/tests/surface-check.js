// checks liquids' surfaces (surface.js): nothing's drawn off the liquid's tiles (a wake running up
// the shore stops at it), the band under the bank is darker than the liquid, foam stays near the
// shore, and with no liquid on screen there's nothing to draw. and with light (lighting.js):
// a lamp mirrored below where it hangs at night and not by
// day, and the light given back only on the liquid. run it with
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

// ---------- light ----------
let lightDrawn = 0;
const lit = load(['config.js', 'lighting.js', 'surface.js'], {
  millis: () => now,
  hexToRgb: game.hexToRgb,
  radians: (d) => (d * Math.PI) / 180,
  UIElement: class {},
  DataFiles: { register() {} },
  ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); } },
  document: { createElement: () => ({ getContext: () => ({ putImageData() {} }) }) },
  drawingContext: { drawImage() {} },
  Wakes: { draw() {} },
  Particles: { list: [] },
  particleAlpha: () => 0.4,
  particleSize: () => 16,
});
const S = lit.Surface;
// an 8 x 8 map with a clear lake in the middle 6 x 6
const clear = { ...water, clarity: 0.45 };
const lake = { get: (col, row) => (col >= 0 && col < 8 && row >= 0 && row < 8 ? (col >= 1 && col <= 6 && row >= 1 && row <= 6 ? clear : sand) : null) };
const sky = (level) => ({ map: lake, ambient: [level, level, level], sky: { sky: [level, level, level], sun: null }, lights: [] });
const lamp = { x: 4 * TILE, y: TILE + 4, z: 2 * TILE, rgb: [1, 0.8, 0.5], radius: 150, length: 0, angle: 0, cone: null };
// every reflection's dashes over a few seconds
const lookAt = (f) => {
  lit.Lighting.frame = f;
  const mirrored = [];
  for (now = 0; now < 4000; now += 250) {
    S.draw(lake, 0, 7, 0, 7, edge, edge);
    mirrored.push(...S.mirrored);
  }
  return { mirrored };
};
const night = lookAt({ ...sky(0.1), lights: [lamp] }).mirrored;
assert(night.length > 0, 'a lamp is mirrored at night');
const mirror = (lamp.y + lamp.z) / ART_SCALE;
assert(night.every((m) => Math.abs(m.ay - mirror) <= game.SURFACE_LIGHT.reflect.tall[1] + 1), 'below where it hangs');
assert.strictEqual(lookAt({ ...sky(1.5), lights: [lamp] }).mirrored.length, 0, 'outshone by day');

// the light given back is only on the liquid, and brighter where a reflection is
const ctx = { save() {}, restore() {}, drawImage: () => lightDrawn++ };
const f = { ...sky(0.3), lights: [lamp] };
lit.Lighting.frame = f;
S.draw(lake, 0, 7, 0, 7, edge, edge);
S.lightUp(ctx, f);
assert.strictEqual(lightDrawn, 1, 'it adds to the light map');
const glow = S.glowPixels;
assert(glow.every((c, i) => !c || S.water[i]), 'only on the liquid');
const plain = glow.find((c, i) => c && S.water[i]);
const dash = S.mirrored.find((m) => S.water[(m.ay - S.oy) * S.w + m.ax - S.ox]);
assert(dash, 'a reflection on the liquid');
assert(brightness(glow[(dash.ay - S.oy) * S.w + dash.ax - S.ox]) > brightness(plain), 'brighter on a reflection');

// how lit somewhere is: more near a lamp, none of it behind a beam
const close = lit.lightNear({ ...sky(0), lights: [lamp] }, lamp.x + 10, lamp.y);
const away = lit.lightNear({ ...sky(0), lights: [lamp] }, lamp.x + 140, lamp.y);
assert(close[0] > away[0] && away[0] > 0, 'lit more near a lamp');
const beam = { ...lamp, cone: Math.PI / 2, aim: 0 };
assert.strictEqual(lit.lightNear({ ...sky(0), lights: [beam] }, lamp.x - 40, lamp.y)[0], 0, 'nothing behind a beam');

function packed(hex) {
  return game.packColour(game.hexToRgb(hex));
}
