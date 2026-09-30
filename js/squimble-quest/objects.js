// the object catalogue: things placed on top of the tiles, like furniture, chests, barrels,
// pots and decorations. works the same way as tiles.js.
//
// how objects are different from tiles:
//   - every spot on the map has exactly one tile, but objects are a list, so several can share
//     a spot (a rug with a table on it)
//   - an object can cover more than one tile (a table 2 tiles wide)
//
// on a map, each object is { type, col, row }: its name here, and the tile its top left corner
// is on. they're drawn in the order they were placed, after the tiles and before the player.
//
// ============================== how to make an object ==============================
//
// add a defineObject() at the bottom of this file:
//
//   defineObject('table', { width: 2, height: 1, colour: '#8a5a33', solid: true });
//
// you only give the settings that are different from OBJECT_DEFAULTS. the settings:
//
//   width, height   how many tiles it covers, across and down
//   colour          placeholder colour, used when there's no image
//   image           a picture for it, e.g. image: 'assets/squimble-quest/objects/table.png'.
//                   stretched to cover its tiles (a 2 x 1 object is drawn 64 x 32)
//   solid           true stops the player walking through it
//
// it shows up in the map editor's Objects tab by itself.
// later, objects could get behaviours like tiles have (e.g. onInteract for opening a chest)
//
// ====================================================================================

const OBJECT_DEFAULTS = {
  width: 1,
  height: 1,
  // bright pink, so an object that forgot its colour is easy to spot
  colour: '#ff00ff',
  image: null,
  solid: false,
};

// every object, by name. filled in by defineObject() below
const OBJECT_TYPES = {};

function defineObject(name, settings) {
  OBJECT_TYPES[name] = { ...OBJECT_DEFAULTS, ...settings, name };
}

// ---------- the objects ----------
// just two to test with: one you bump into, and one you walk over

defineObject('table', { width: 2, height: 1, colour: '#8a5a33', solid: true });
defineObject('rug',   { width: 2, height: 2, colour: '#b0413e' });
