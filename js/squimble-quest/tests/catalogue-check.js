// checks every item, enemy, npc, object and tile file loads the way the game loads it with no
// warnings (a typo'd setting, an ai, onDeath, attack or wear that doesn't exist), and that everything
// they name by name exists: sounds and voices (a missing one is just silent in the game), particle
// effects, look parts, pictures (the player's too), and the player's starting items. run it after adding or changing
// files with node js/squimble-quest/tests/catalogue-check.js
// no output means it all passed
const fs = require('fs');
const assert = require('assert');
const { load, asset, assetFolder, ASSETS } = require('./load');

const warnings = [];
const game = load(['config.js', 'utils.js', 'datafiles.js', 'pathfinding.js', 'weapons.js', 'items.js', 'enemies.js', 'npcs.js', 'objects.js', 'tiles.js'], {
  console: { ...console, warn: (warning) => warnings.push(warning) },
});
const { ITEM_TYPES, ENEMY_TYPES, NPC_TYPES, OBJECT_TYPES, TILE_DEFAULTS, PLAYER, WEAPON_DEFAULTS } = game;

const names = (folder) => new Set(asset(`${folder}/index.json`));
const sounds = names('sounds');
const voices = names('voices');
const particles = names('particles');
const parts = names('parts');

// every file, defined like DataFiles.load() does. tiles drop settings that aren't in TILE_DEFAULTS
// without saying (setTile() needs p5, so isn't run), so those are looked for here
for (const [name, settings] of assetFolder('items')) game.defineItem(name, settings);
for (const [name, settings] of assetFolder('enemies')) game.defineEnemy(name, settings);
for (const [name, settings] of assetFolder('npcs')) game.defineNpc(name, settings);
for (const [name, settings] of assetFolder('objects')) game.defineObject(name, settings);
const tiles = assetFolder('tiles');
for (const [name, settings] of tiles) {
  for (const key of Object.keys(settings)) assert(key in TILE_DEFAULTS, `tiles/${name}.json has a setting "${key}" that isn't in TILE_DEFAULTS (tiles.js), so the game drops it`);
}
assert.deepStrictEqual(warnings, [], 'every file loads with no warnings');

// the names files use for other files
const named = (what, name, list, folder) => assert(name === null || name === undefined || list.has(name), `${what} names the ${folder.slice(0, -1)} "${name}", but there's no ${folder}/${name}.json`);
const pictured = (what, file) => assert(!file || fs.existsSync(`${ASSETS}../../${file}`), `${what}'s picture ${file} isn't there`);

function weaponNames(owner, weapon) {
  if (!weapon) return;
  for (const hit of [weapon, ...(weapon.combo ?? [])]) {
    for (const key of ['attackSound', 'drawSound', 'hitSound', 'killSound']) named(`${owner}'s weapon (${key})`, hit[key], sounds, 'sounds');
  }
  for (const key of Object.keys(weapon)) assert(key in WEAPON_DEFAULTS, `${owner}'s weapon has a setting "${key}"`);
}

for (const [name, type] of Object.entries(ITEM_TYPES)) {
  weaponNames(`the item "${name}"`, type.weapon);
  pictured(`the item "${name}"`, type.image);
}
for (const [name, type] of Object.entries(ENEMY_TYPES)) {
  const enemy = `the enemy "${name}"`;
  weaponNames(enemy, type.weapon);
  named(enemy, type.sound, sounds, 'sounds');
  named(enemy, type.hitParticles, particles, 'particles');
  named(enemy, type.deathParticles, particles, 'particles');
  pictured(enemy, type.image);
}
for (const [name, type] of Object.entries(NPC_TYPES)) {
  const npc = `the npc "${name}"`;
  named(npc, type.voice, voices, 'voices');
  named(npc, type.sound, sounds, 'sounds');
  for (const part of Object.values(type.look?.parts ?? {})) named(`${npc}'s look`, part, parts, 'parts');
  pictured(npc, type.image);
  pictured(npc, type.portrait);
}
for (const [name, type] of Object.entries(OBJECT_TYPES)) {
  for (const effect of type.particles ?? []) named(`the object "${name}"`, effect, particles, 'particles');
  pictured(`the object "${name}"`, type.image);
}
for (const [name, settings] of tiles) {
  const tile = `the tile "${name}"`;
  for (const sound of [...(settings.sounds ?? []), ...(settings.stepSounds ?? [])]) named(tile, sound, sounds, 'sounds');
  for (const effect of settings.particles ?? []) named(tile, effect, particles, 'particles');
  for (const other of settings.blendsWith ?? []) assert(tiles.some(([n]) => n === other), `${tile} blends with "${other}", which isn't a tile`);
}
pictured('PLAYER (config.js)', PLAYER.image);
pictured('PLAYER (config.js) death', PLAYER.deathImage);
named('PLAYER (config.js)', PLAYER.hurtSound, sounds, 'sounds');
named('PLAYER (config.js)', PLAYER.hitParticles, particles, 'particles');
for (const item of PLAYER.startingItems) assert(ITEM_TYPES[item], `PLAYER.startingItems (config.js) has "${item}", which isn't an item`);
