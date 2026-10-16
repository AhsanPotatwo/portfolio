// checks atmospheres (atmosphere.js): every file in atmospheres/ loads with no unknown settings, and
// the particles and sounds it names exist, every pattern joins up at its edges so it tiles, Cover is
// how much of the screen is covered for every pattern, and Bands steps it into flat shades.
// run it with node js/squimble-quest/tests/atmosphere-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const warnings = [];
// UIElement is only extended when it loads. nothing gets drawn here
const game = { console: { warn: (w) => warnings.push(w) }, UIElement: class {} };
vm.createContext(game);
vm.runInContext(['utils.js', 'datafiles.js', 'atmosphere.js'].map((f) => fs.readFileSync(`${__dirname}/../${f}`, 'utf8')).join('\n')
  + '\nthis.ATMOSPHERES = ATMOSPHERES; this.ATMOSPHERE_PATTERNS = ATMOSPHERE_PATTERNS; this.atmosphereField = atmosphereField; this.coverAlpha = coverAlpha; this.defineAtmosphere = defineAtmosphere;', game);
const { ATMOSPHERES, ATMOSPHERE_PATTERNS, atmosphereField, coverAlpha, defineAtmosphere } = game;

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

// bands step it into that many shades, and 0 bands is smooth
const shades = (bands) => new Set(Array.from({ length: 101 }, (_, i) => coverAlpha(i / 100, 50, 100, bands))).size;
assert.strictEqual(shades(3), 4);
assert(shades(0) > 50);
