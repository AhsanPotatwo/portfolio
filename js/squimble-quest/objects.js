// the object catalogue: things that sit on top of tiles (furniture, chests, barrels, decorations). each
// kind is a file in assets/squimble-quest/objects/, like objects/table.json, listed in
// objects/index.json (datafiles.js). the other catalogues (enemies.js, npcs.js, items.js, tiles.js...)
// work the same way. unlike tiles, a map keeps objects in a list, so a few can share a spot (a
// table on a rug) and one can cover several tiles. on a map each one is { type, col, row } (its top
// left tile), and they're drawn in the order they were placed, after the tiles but before the player.
//
// ============================== how to make an object ==============================
//
// make a file named after it in objects/, with only the settings that are different from
// OBJECT_DEFAULTS, and add its name to objects/index.json. objects/table.json is:
//   { "width": 2, "height": 1, "colour": "#8a5a33", "solid": true }
//
//   width, height   how many tiles it covers
//   colour          the placeholder colour when there's no image
//   image           like 'assets/squimble-quest/objects/table.png', stretched over its tiles (2 x 1 is 64 x 32)
//   solid           blocks the player
//   particles       the particle effects it keeps making, like a campfire's
//                   ["campfire-flames", "campfire-smoke"] (particles/), or null for none. they come
//                   from the middle of the tiles it covers (ParticleEmitters in particles.js)
//   particleRate    how often compared to each effect's own rate (its Keep going tab), 2 is twice
//   particleX, particleY  px to move where they come from, like -20 for the top of a chimney
//   storage         makes it something you keep items in (a chest, barrel, wardrobe), or null if it
//                   isn't. it's its own settings, only the ones that differ from STORAGE_DEFAULTS, like
//                   objects/chest.json's { "label": "Chest", "slots": 10 }. E opens it beside your
//                   inventory (StorageObjects in inventory.js)
//
// the editor's Objects tab picks it up by itself.
//
// ====================================================================================

const OBJECT_DEFAULTS = {
  width: 1,
  height: 1,
  // pink so a missing colour is obvious
  colour: '#ff00ff',
  image: null,
  solid: false,
  particles: null,
  particleRate: 1,
  particleX: 0,
  particleY: 0,
  storage: null,
};

// what an object's storage setting starts from. a new thing every storage object can have (only
// taking some categories of item, a lock) gets its normal value here, and gets used in
// StorageObjects or Inventory (inventory.js)
const STORAGE_DEFAULTS = {
  // the name along the top of its box
  label: 'Storage',
  slots: 10,
  // slots in each row of its box. its box goes above yours on the inventory screen, so about 4 rows
  // fit (more slots want more columns, up to about 18)
  columns: 5,
};

// filled in from the object files (bottom of this file)
const OBJECT_TYPES = {};

// defineType() is in utils.js
function defineObject(name, settings) {
  defineType(OBJECT_TYPES, OBJECT_DEFAULTS, 'object', name, settings);
  const type = OBJECT_TYPES[name];
  if (type.storage) type.storage = withDefaults(STORAGE_DEFAULTS, 'storage', name, type.storage);
}

// ---------- the object files ----------

// every kind of object loads once at the start, before the maps (datafiles.js)
DataFiles.register('object', {
  define: defineObject,
  // colours and pictures (utils.js)
  loaded: () => prepareArt(OBJECT_TYPES, 'object'),
});
