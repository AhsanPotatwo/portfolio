// checks lighting (lighting.js): every light file loads with no unknown settings, everything that names
// a light names one that exists, shadows of boxes cover the box and fall away from the light, the sun
// rises, goes over and sets with the moon out between, and flickers stay between out and full.
// run it with node js/squimble-quest/tests/lighting-check.js
// no output means it all passed
const assert = require('assert');
const { load, assetFolder } = require('./load');

const warnings = [];
const game = load(['utils.js', 'lighting.js'], {
  console: { warn: (w) => warnings.push(w) },
  DataFiles: { register: () => {} },
  hexToRgb: (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
  radians: (d) => (d * Math.PI) / 180,
  TILE: 32,
});
const { LIGHT_TYPES, LIGHT_FLICKERS, defineLight, lightSpots, boxShadow, convexHull, skyAt, tileShadowHeight, LIGHTING } = game;

// every light loads, and its flicker is one there is
for (const [name, settings] of assetFolder('lights')) defineLight(name, settings);
assert.deepStrictEqual(warnings, [], 'every light file loads with no warnings');

// objects, tiles and items only name lights that exist, in a shape lightSpots() understands
for (const folder of ['objects', 'tiles', 'items']) {
  for (const [name, settings] of assetFolder(folder)) {
    if (!settings.light) continue;
    const list = Array.isArray(settings.light) ? settings.light : [settings.light];
    for (const spot of list) {
      const light = typeof spot === 'string' ? spot : spot.light;
      assert(LIGHT_TYPES[light], `${folder}/${name}.json names the light "${light}", but there's no lights/${light}.json`);
    }
    assert.strictEqual(lightSpots(settings.light).length, list.length);
  }
}

// a box's shadow from a light south of it and higher up covers the box and goes north, and stops
const box = { x0: 0, y0: 0, x1: 64, y1: 32, h: 32 };
const inside = (points, x, y) => {
  // convex and going one way round, so a point inside is on the same side of every edge
  const sides = points.map(([ax, ay], i) => {
    const [bx, by] = points[(i + 1) % points.length];
    return Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
  });
  return sides.every((s) => s >= 0) || sides.every((s) => s <= 0);
};
const lamp = { x: 32, y: 100, z: 64, radius: 200 };
const shadow = boxShadow(box, lamp, null);
assert(inside(shadow, 32, 16), 'the box is in its own shadow');
assert(inside(shadow, 32, -20), 'the shadow falls away from the light');
assert(!inside(shadow, 32, 60), 'not towards it');
// the top's back corners land at light + (corner - light) * z / (z - h), y = 100 - 100 * 2 = -100
assert(Math.min(...shadow.map(([, y]) => y)) === -100, 'a light above the box casts a shadow that ends');
// a light lower than the box throws it out past its reach
const low = boxShadow(box, { ...lamp, z: 20 }, null);
assert(Math.min(...low.map(([, y]) => y)) < -lamp.radius, "a light below the top can't see over it");
// from the sun, pushed the same way for every corner, and kept to the longest shadow
const sunny = boxShadow(box, null, { x: 0, y: 100 });
assert(Math.max(...sunny.map(([, y]) => y)) === 32 + LIGHTING.longestShadow);
assert.strictEqual(convexHull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]).length, 4, "the hull leaves out points inside");

// walls block light by their own height or a wall's, water doesn't
assert.strictEqual(tileShadowHeight({ solid: true, seeThrough: false, shadowHeight: null }), LIGHTING.wallHeight);
assert.strictEqual(tileShadowHeight({ solid: true, seeThrough: true, shadowHeight: null }), 0);
assert.strictEqual(tileShadowHeight({ solid: true, shadowHeight: 0 }), 0);
assert.strictEqual(tileShadowHeight({ solid: false, shadowHeight: 96 }), 96);
assert.strictEqual(tileShadowHeight(null), 0);

// the sun: rising from where it is at midday plus a quarter turn, highest at midday, setting a quarter
// turn the other way. the moon's out at night, nothing's up underground
const outside = { lightSun: 100, lightSunFrom: 270 };
const morning = skyAt(outside, 7);
const noon = skyAt(outside, 12);
const evening = skyAt(outside, 17);
assert(morning.sun && noon.sun && evening.sun, 'the sun is up in the day');
assert(noon.elevation > morning.elevation && noon.elevation > evening.elevation, "it's highest at midday");
assert(Math.sin(noon.angle) < -0.99, 'at midday it comes from Sun from (the top)');
assert(Math.cos(morning.angle) > 0.5, 'it rises on the right');
assert(Math.cos(evening.angle) < -0.5, 'and sets on the left');
const night = skyAt(outside, 0);
assert(night.sun && Math.max(...night.sun) < Math.max(...noon.sun), 'the moon is out at night, dimmer');
assert(Math.max(...night.sky) < Math.max(...noon.sky), 'the night sky is darker');
assert.strictEqual(skyAt({ lightSun: 0, lightSunFrom: 270 }, 12).sun, null, 'no sun underground');
assert.deepStrictEqual([...skyAt({ lightSun: 0, lightSunFrom: 270 }, 12).sky], [0, 0, 0]);
assert.deepStrictEqual([...skyAt(outside, 24.5).sky], [...skyAt(outside, 0.5).sky], 'the day goes round');

// flickers stay between out and full, and every one dips sometimes
for (const [name, flicker] of Object.entries(LIGHT_FLICKERS)) {
  let lowest = 1;
  for (let t = 0; t < 60; t += 0.01) {
    const v = flicker(t, 3.7, 0.8);
    assert(v >= 0 && v <= 1, `${name} is ${v} at ${t}`);
    lowest = Math.min(lowest, v);
  }
  if (name !== 'none') assert(lowest < 0.9, `${name} flickers`);
}

// overlapping light rolls off towards white: as it is up to the knee, always getting brighter, never
// past white, and close to it at the most there's room for
const { lightTone, shadowSlant } = game;
assert.strictEqual(lightTone(0), 0);
assert.strictEqual(lightTone(LIGHTING.knee), LIGHTING.knee);
for (let l = 0; l < LIGHTING.headroom; l += 0.05) assert(lightTone(l + 0.05) > lightTone(l), 'brighter light is brighter');
assert(lightTone(LIGHTING.headroom) < 1 && lightTone(LIGHTING.headroom) > 0.95, 'the most there can be is nearly white');
assert(lightTone(1) < 1, 'one full light leaves room for another');

// shadows slant away from the light, and one edge on to it keeps some depth instead of going flat
assert.deepStrictEqual({ ...shadowSlant({ x: 0, y: 2 }) }, { x: 0, y: 2 }, 'from behind, straight down the screen');
const side = shadowSlant({ x: 3, y: 0 });
assert(side.x === 3 && side.y === LIGHTING.thinnest * 3, 'from the side, still thinnest of its length deep, in front');
assert(shadowSlant({ x: 3, y: -0.1 }).y < 0, 'falling behind if that is the way it was going');
