// the object catalogue: things on top of tiles (furniture, chests, barrels, decorations). other
// catalogues (enemies.js, npcs.js, items.js...) work the same; tiles are data in tiles.json (tiles.js).
// unlike tiles, objects are a list, so several can share a spot (a table on a rug) and one can cover
// several tiles. on a map each is { type, col, row } (top left tile), drawn in placement order after
// tiles, before the player.
//
// ============================== how to make an object ==============================
//
// add a defineObject() at the bottom, with only settings that differ from OBJECT_DEFAULTS:
//   defineObject('table', { width: 2, height: 1, colour: '#8a5a33', solid: true });
//
//   width, height   tiles covered
//   colour          placeholder when there's no image
//   image           e.g. 'assets/squimble-quest/objects/table.png', stretched over its tiles (2 x 1 → 64 x 32)
//   solid           blocks the player
//
// the editor's Objects tab picks it up. later: behaviours like onInteract (opening a chest)
//
// ====================================================================================

const OBJECT_DEFAULTS = {
  width: 1,
  height: 1,
  // pink, so a missing colour is obvious
  colour: '#ff00ff',
  image: null,
  solid: false,
};

const OBJECT_TYPES = {};

// defineType() is in utils.js
function defineObject(name, settings) {
  defineType(OBJECT_TYPES, OBJECT_DEFAULTS, 'object', name, settings);
}

// ---------- the objects ----------
// two test ones: solid, and walk-over

defineObject('table', { width: 2, height: 1, colour: '#8a5a33', solid: true });
defineObject('rug',   { width: 2, height: 2, colour: '#b0413e' });
