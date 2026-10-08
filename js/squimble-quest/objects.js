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
//
// the editor's Objects tab picks it up by itself. later on: things they do, like onInteract for opening
// a chest
//
// ====================================================================================

const OBJECT_DEFAULTS = {
  width: 1,
  height: 1,
  // pink so a missing colour is obvious
  colour: '#ff00ff',
  image: null,
  solid: false,
};

// filled in from the object files (bottom of this file)
const OBJECT_TYPES = {};

// defineType() is in utils.js
function defineObject(name, settings) {
  defineType(OBJECT_TYPES, OBJECT_DEFAULTS, 'object', name, settings);
}

// ---------- the object files ----------

// every kind of object loads once at the start, before the maps (datafiles.js). just two test ones for
// now: a solid table and a rug you can walk over
DataFiles.register('object', {
  define: defineObject,
  // colours and pictures (utils.js)
  loaded: () => prepareArt(OBJECT_TYPES, 'object'),
});
