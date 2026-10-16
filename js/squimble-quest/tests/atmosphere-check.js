// checks atmospheres (atmosphere.js): every file in atmospheres/ loads with no unknown settings, and
// the particles and sounds it names exist, every pattern joins up at its edges so it tiles, Cover is
// how much of the screen is covered for every pattern, Bands steps it into flat shades, and areas fade
// in over their edge and send their sound from the nearest spot in them.
// run it with node js/squimble-quest/tests/atmosphere-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const warnings = [];
// UIElement is only extended when it loads. nothing gets drawn here
const game = { console: { warn: (w) => warnings.push(w) }, UIElement: class {}, TILE: 32, constrain: (n, lo, hi) => Math.min(hi, Math.max(lo, n)) };
vm.createContext(game);
vm.runInContext(['utils.js', 'datafiles.js', 'atmosphere.js'].map((f) => fs.readFileSync(`${__dirname}/../${f}`, 'utf8')).join('\n')
  + '\nthis.ATMOSPHERES = ATMOSPHERES; this.ATMOSPHERE_PATTERNS = ATMOSPHERE_PATTERNS; this.atmosphereField = atmosphereField; this.coverAlpha = coverAlpha; this.defineAtmosphere = defineAtmosphere; this.areaAmount = areaAmount; this.areaNearest = areaNearest;', game);
const { ATMOSPHERES, ATMOSPHERE_PATTERNS, atmosphereField, coverAlpha, defineAtmosphere, areaAmount, areaNearest } = game;

const assets = `${__dirname}/../../../assets/squimble-quest/`;
const index = (folder) => JSON.parse(fs.readFileSync(`${assets}${folder}/index.json`, 'utf8'));

// every atmosphere loads with no typo'd settings or patterns, and its weather and sounds exist
const particles = index('particles');
const sounds = index('sounds');
for (const name of index('atmospheres')) {
  defineAtmosphere(name, JSON.parse(fs.readFileSync(`${assets}atmospheres/${name}.json`, 'utf8')));
  const a = ATMOSPHERES[name];
  for (const effect of a.weather ?? []) assert(particles.includes(effect), `${name}'s weather "${effect}" is a particle effect`);
  for (const sound of [a.sound, a.flashSound]) assert(!sound || sounds.includes(sound), `${name}'s sound "${sound}" is a sound`);
}
assert.deepStrictEqual(warnings, []);

for (const [name, pattern] of Object.entries(ATMOSPHERE_PATTERNS)) {
  // joins up: one whole picture across is the same place again. specks are single pixels with nothing
  // to join
  if (name !== 'specks') {
    for (const [x, y] of [[0.13, 0.71], [0.5, 0.02], [0.97, 0.4]]) {
      assert(Math.abs(pattern.value(x, y) - pattern.value(x + 1, y)) < 1e-9, `${name} tiles across`);
      assert(Math.abs(pattern.value(x, y) - pattern.value(x, y + 1)) < 1e-9, `${name} tiles down`);
    }
  }
  // cover is how much of it is at least half solid, give or take the soft edge
  const field = atmosphereField(name);
  for (const cover of [0, 10, 50, 90, 100]) {
    const solid = field.filter((v) => coverAlpha(v, cover, 0, 0) >= 0.5).length / field.length;
    assert(Math.abs(solid - cover / 100) < 0.02, `${name} at ${cover}% cover is ${Math.round(solid * 100)}% covered`);
  }
}

// areas: 1 well inside, 0 outside, easing up across the fade, and an oval's corners are outside it
const box = { col: 0, row: 0, cols: 10, rows: 6, shape: 'box', fade: 2, strength: 100 };
const T = 32;
assert.strictEqual(areaAmount(box, 5 * T, 3 * T), 1);
assert.strictEqual(areaAmount(box, -1, 3 * T), 0);
assert.strictEqual(areaAmount(box, 11 * T, 3 * T), 0);
const across = [0.5, 1, 1.5, 2].map((tiles) => areaAmount(box, tiles * T, 3 * T));
across.slice(1).forEach((v, i) => assert(v > across[i], 'it fades in across its fade'));
assert.strictEqual(areaAmount({ ...box, fade: 0 }, 1, 1), 1, 'no fade is a hard edge');
const oval = { ...box, shape: 'oval' };
assert.strictEqual(areaAmount(oval, 0.5 * T, 0.5 * T), 0, "an oval's corner is outside it");
assert.strictEqual(areaAmount(oval, 5 * T, 3 * T), 1);
// its sound comes from the nearest spot in it: on its edge from outside, where you are from inside
const near = areaNearest(oval, 20 * T, 3 * T, {});
assert(Math.abs(near.x - 10 * T) < 1e-9 && Math.abs(near.y - 3 * T) < 1e-9);
assert.deepStrictEqual(areaNearest(box, 2 * T, 2 * T, {}), { x: 2 * T, y: 2 * T });

// bands step it into that many shades, and 0 bands is smooth
const shades = (bands) => new Set(Array.from({ length: 101 }, (_, i) => coverAlpha(i / 100, 50, 100, bands))).size;
assert.strictEqual(shades(3), 4);
assert(shades(0) > 50);
