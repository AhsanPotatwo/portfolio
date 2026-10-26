// checks every item, enemy, npc, object and tile file loads the way the game loads it with no
// warnings (a typo'd setting, an ai, onDeath, attack or wear that doesn't exist), and that everything
// they name by name exists: sounds and voices (a missing one is just silent in the game), particle
// effects, look parts and the player's starting items. every picture setting (PICTURE_SETTINGS in
// art.js) in them, in PLAYER, RARITIES, UI_ART and BUTTON_STYLES has to be a picture that makes sense
// (pictureProblem()) whose file is there. run it after adding or changing files with
// node js/squimble-quest/tests/catalogue-check.js
// no output means it all passed
const fs = require('fs');
const assert = require('assert');
const { load, asset, assetFolder, ASSETS } = require('./load');

const warnings = [];
const game = load(['config.js', 'utils.js', 'art.js', 'datafiles.js', 'pathfinding.js', 'weapons.js', 'items.js', 'enemies.js', 'npcs.js', 'objects.js', 'tiles.js'], {
  console: { ...console, warn: (warning) => warnings.push(warning) },
});
const { ITEM_TYPES, ENEMY_TYPES, NPC_TYPES, OBJECT_TYPES, TILE_DEFAULTS, PLAYER, WEAPON_DEFAULTS, RARITIES, UI_ART, BUTTON_STYLES, PICTURE_SETTINGS, pictureProblem } = game;

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

// a picture setting (art.js) that makes sense, with its file there
function picture(what, setting) {
  if (!setting) return;
  const problem = pictureProblem(setting);
  assert(!problem, `${what}'s picture ${problem}`);
  const file = typeof setting === 'string' ? setting : setting.image;
  assert(fs.existsSync(`${ASSETS}../../${file}`), `${what}'s picture ${file} isn't there`);
}
// every picture setting on something, its weapon's and its weapon's combo hits' too
function pictures(what, type) {
  for (const holder of [type, type.weapon, ...(type.weapon?.combo ?? [])]) {
    for (const key of PICTURE_SETTINGS) picture(`${what} (${key})`, holder?.[key]);
  }
}

function weaponNames(owner, weapon) {
  if (!weapon) return;
  for (const hit of [weapon, ...(weapon.combo ?? [])]) {
    for (const key of ['attackSound', 'drawSound', 'hitSound', 'killSound']) named(`${owner}'s weapon (${key})`, hit[key], sounds, 'sounds');
  }
  for (const key of Object.keys(weapon)) assert(key in WEAPON_DEFAULTS, `${owner}'s weapon has a setting "${key}"`);
}

for (const [name, type] of Object.entries(ITEM_TYPES)) {
  weaponNames(`the item "${name}"`, type.weapon);
  pictures(`the item "${name}"`, type);
}
for (const [name, type] of Object.entries(ENEMY_TYPES)) {
  const enemy = `the enemy "${name}"`;
  weaponNames(enemy, type.weapon);
  named(enemy, type.sound, sounds, 'sounds');
  named(enemy, type.hitParticles, particles, 'particles');
  named(enemy, type.deathParticles, particles, 'particles');
  pictures(enemy, type);
}
for (const [name, type] of Object.entries(NPC_TYPES)) {
  const npc = `the npc "${name}"`;
  named(npc, type.voice, voices, 'voices');
  named(npc, type.sound, sounds, 'sounds');
  for (const part of Object.values(type.look?.parts ?? {})) named(`${npc}'s look`, part, parts, 'parts');
  pictures(npc, type);
}
for (const [name, type] of Object.entries(OBJECT_TYPES)) {
  for (const effect of type.particles ?? []) named(`the object "${name}"`, effect, particles, 'particles');
  pictures(`the object "${name}"`, type);
}
for (const [name, settings] of tiles) {
  const tile = `the tile "${name}"`;
  for (const sound of [...(settings.sounds ?? []), ...(settings.stepSounds ?? [])]) named(tile, sound, sounds, 'sounds');
  for (const effect of settings.particles ?? []) named(tile, effect, particles, 'particles');
  for (const other of settings.blendsWith ?? []) assert(tiles.some(([n]) => n === other), `${tile} blends with "${other}", which isn't a tile`);
}
pictures('PLAYER (config.js)', PLAYER);
named('PLAYER (config.js)', PLAYER.hurtSound, sounds, 'sounds');
named('PLAYER (config.js)', PLAYER.hitParticles, particles, 'particles');
for (const item of PLAYER.startingItems) assert(ITEM_TYPES[item], `PLAYER.startingItems (config.js) has "${item}", which isn't an item`);
for (const [name, rarity] of Object.entries(RARITIES)) picture(`RARITIES.${name} (items.js)`, rarity.image);

// the ui's pictures (config.js). wearIcons is a picture per wear place
for (const [name, setting] of Object.entries(UI_ART)) {
  const many = setting && typeof setting === 'object' && !('image' in setting);
  for (const [part, each] of many ? Object.entries(setting) : [[null, setting]]) picture(`UI_ART.${name}${part ? `.${part}` : ''}`, each);
}
assert.deepStrictEqual(Object.keys(UI_ART.wearIcons).sort(), Object.keys(game.WEAR_PLACES).sort(), 'UI_ART.wearIcons has a picture for every WEAR_PLACES place');
for (const [name, style] of Object.entries(BUTTON_STYLES)) {
  for (const key of ['art', 'hoverArt', 'pressedArt']) picture(`BUTTON_STYLES.${name}.${key}`, style[key]);
}

// a word where a number should be keeps the default (and says so), but null for "none" goes through
const typo = game.withDefaults({ height: 50, doorOpenTime: 1 }, 'enemy', 'typo', { height: '50', doorOpenTime: null });
assert(typo.height === 50 && typo.doorOpenTime === null && warnings.length === 1, 'a setting of the wrong type keeps its default');

// a wrong picture setting gets caught
assert(pictureProblem({ image: 'a.png', directions: 3 }) && pictureProblem({ frames: 2 }) && pictureProblem({ image: 'a.png', fsp: 8 }) && !pictureProblem({ image: 'a.png', frames: 6, fps: 10, directions: 4, loop: false }));
