// the tile catalogue: every kind of tile in the game, and what it does.
// a map (tilemap.js) only stores tile names like 'grass', and looks up everything else here.
//
// the tiles themselves are in one file, assets/squimble-quest/tiles/tiles.json, loaded when the game
// starts. this file loads it, keeps the tiles in TILE_TYPES, and turns them back into a file.
//
// ============================== how to make a tile ==============================
//
// in the map editor (dev mode, then B), open the Tiles tab and click New in the inspector. right
// click a tile in the palette to change it. changes show straight away, then Export tiles downloads a new tiles.json:
// put it in assets/squimble-quest/tiles/ (replacing the old one) and the tile's in the game for good.
// if you gave it a picture, that goes in the folder too (the message after exporting says where).
// the full guide is assets/squimble-quest/tiles/README.md.
//
// tiles.json can be changed by hand too. each tile is one line, and only needs the settings that are
// different from TILE_DEFAULTS below:
//
//   { "name": "lava", "colour": "#e4572e", "speed": 0.7, "damagePerSecond": 25 }
//
//   name             what maps call it. renaming a tile loses it from every map that uses it
//   colour           what it looks like without a texture (and in the editor's bar, for dual grid tiles
//                    without one). a texture always covers the colour
//   dualGrid         true for ground that rounds off and blends into the tiles next to it (grass,
//                    dirt, sand), drawn from a tileset on a second grid (see dualgrid.js)
//   texture          a picture's file name, or left out for just the colour. for a normal tile it's in
//                    TILE_IMAGE_FOLDER, one picture stretched over each tile (16 x 16 pixel art works
//                    well). for a dual grid tile it's in DUAL_TILESET_FOLDER, a tileset of 4 x 4 pieces
//   solid            true stops anything walking onto it (walls, deep water)
//   speed            how fast you walk on it compared to normal. 1 is normal, 0.5 is half speed
//   damagePerSecond  hurts anything standing on it this much a second (lava)
//   damagePerStep    hurts anything this much each time it steps onto one (spikes)
//   healPerSecond    heals anything standing on it this much a second, up to its most (healing spring)
//   slippery         0 to 0.95, how much you slide about. 0 is normal, 0.9 is ice. you keep going
//                    the way you were and only slowly turn, until you bump into something
//   pushDirection    "up", "down", "left" or "right" (PUSH_DIRECTIONS below): pushes anything on it
//                    that way, pushSpeed tiles a second (conveyor belts, currents, wind)
//   pushSpeed        how hard it pushes, in tiles a second. walking speed is 5. 0 doesn't push
//   blendsWith       which dual grid tiles round off onto it, e.g. ["grass"]. left out, they all do.
//                    [] is none. the ones that don't stop in a straight line at its edge instead,
//                    which looks better for things like planks and walls
//
// these work for everyone: the player, enemies and npcs (walk() and checkTile() in character.js).
// the order of the tiles is the order in the editor's bar, and where two dual grid tiles meet, the one
// further down the file goes on top, so put the ones underneath first (dirt before grass)
//
// ---------- adding a new kind of tile setting ----------
//
// e.g. "slippery" for ice. every place that needs to know about it:
//   1. TILE_DEFAULTS below: add it with its normal value. tiles that don't mention it get that, and
//      it's also what lets it load from tiles.json and save back into it (anything that isn't in
//      TILE_DEFAULTS is ignored)
//   2. whatever it changes, e.g. checkTile() in character.js for things that happen to whoever's
//      standing on the tile
//   3. a line for it in TILE_BEHAVIOURS at the top of tileeditor.js, which gives it a row in the
//      tile editor's box, on whichever tab it says (a new tab name makes a new tab)
// older tiles.json files still load fine, a tile without the new setting just gets its normal value
//
// =================================================================================

// the tiles file, and where textures live, from the site's main folder
const TILE_FILE = 'assets/squimble-quest/tiles/tiles.json';
const TILE_IMAGE_FOLDER = 'assets/squimble-quest/tiles/normal/';
const DUAL_TILESET_FOLDER = 'assets/squimble-quest/tiles/dual-grid/';

// written at the top of tiles.json, like a map file's format and version (mapfile.js)
const TILES_FORMAT = 'squimble-quest-tiles';
const TILES_VERSION = 1;

// what every tile starts with before its own settings are added. these are also the only settings a
// tile can have: anything else in tiles.json is ignored
const TILE_DEFAULTS = {
  // bright pink, so a tile that forgot its colour is easy to spot
  colour: '#ff00ff',
  // a normal tile, one square each
  dualGrid: false,
  // no texture, just the colour
  texture: null,
  // can be walked on
  solid: false,
  // normal walking speed
  speed: 1,
  // doesn't hurt anyone
  damagePerSecond: 0,
  damagePerStep: 0,
  // doesn't heal anyone
  healPerSecond: 0,
  // not slippery at all
  slippery: 0,
  // doesn't push anyone anywhere
  pushDirection: null,
  pushSpeed: 0,
  // every dual grid tile rounds off onto it
  blendsWith: null,
};

// does this dual grid tile round off onto tile (see blendsWith above)? if not, it stops in a straight
// line at tile's edge (drawDualCorner() in dualgrid.js)
function blendsOnto(tile, dual) {
  return !tile.blendsWith || tile.blendsWith.includes(dual.name);
}

// the ways a tile can push (pushDirection), as x and y
const PUSH_DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// how quickly you can change direction on a slippery tile before its slipperiness is taken off. the
// same speed approach() in utils.js takes: bigger turns quicker. 0.9 slippery leaves a tenth of it
const SLIPPERY_GRIP = 10;

// every tile, by name. filled in from tiles.json by loadTileFile(), and by the tile editor
// (tileeditor.js). each is its settings, plus:
//   layer       its place in the list, so dual grid tiles further down go on top
//   fill        its colour as a p5 colour, made once rather than every time it's drawn
//   textureImg  its texture as a picture (a p5 image), or null. the tile editor shows it
//   img         the picture a normal tile is drawn with, or null
//   dualTiles   a dual grid tile's tileset cut into pieces (dualgrid.js), or null
// a tile without its img or dualTiles (no texture, or it hasn't loaded) is drawn in its colour
const TILE_TYPES = {};

// adds a tile, or changes the one with that name, from its settings (what tiles.json has for it).
// its texture loads from its folder, unless picture (a p5 image) is given to use instead, like one
// just chosen in the tile editor. gives back a promise that finishes once the texture's ready (or
// couldn't load), so the game can wait for them before it starts
function setTile(settings, picture = null) {
  // a changed tile keeps its place in the list, a new one goes on the end
  const type = TILE_TYPES[settings.name] ?? { layer: Object.keys(TILE_TYPES).length };
  // the defaults first, then its own settings over the top. so a setting that's left out goes back
  // to normal, rather than keeping whatever the tile had before
  Object.assign(type, TILE_DEFAULTS, settings);
  TILE_TYPES[type.name] = type;
  type.fill = color(type.colour);

  useTexture(type, picture);
  // nothing to load. Promise.resolve() is a promise that's already finished, so anything waiting
  // on this carries straight on
  if (picture || !type.texture) return Promise.resolve();
  // just the colour until the texture's loaded
  return new Promise((done) => {
    loadImage(texturePath(type), (img) => {
      useTexture(type, img);
      done();
    }, () => {
      console.warn(`Couldn't load "${texturePath(type)}" for the ${type.name} tile, using its colour instead`);
      done();
    });
  });
}

// where a tile's texture file is. normal and dual grid textures have a folder each
function texturePath(type) {
  return (type.dualGrid ? DUAL_TILESET_FOLDER : TILE_IMAGE_FOLDER) + type.texture;
}

// draws the tile with this picture (a p5 image) from now on, or just its colour with null.
// a dual grid tileset that isn't 4 x 4 pieces can't be used, so that's just its colour too
function useTexture(type, img) {
  type.textureImg = img;
  type.img = img && !type.dualGrid ? img : null;
  type.dualTiles = img && type.dualGrid ? cutDualTileset(img, type.texture) : null;
}

// ---------- tiles.json ----------

// loads every tile from TILE_FILE, and their textures. run once when the game starts, before the maps
// (mapfile.js), which need to know which tiles there are. gives back a promise that finishes when
// it's all loaded or failed.
// like map files, a problem never stops the game: it's a warning in the browser console
function loadTileFile() {
  // fetchJson() is in utils.js
  return fetchJson(TILE_FILE)
    .then((data) => {
      if (!Array.isArray(data?.tiles)) throw new Error("it doesn't look like a Squimble Quest tiles file");
      const textures = [];
      for (const entry of data.tiles) {
        if (typeof entry.name !== 'string' || entry.name === '') {
          console.warn(`A tile in ${TILE_FILE} has no name, so it's been left out`);
          continue;
        }
        // only the settings a tile can have (TILE_DEFAULTS), so a typo can't add junk to it
        const settings = { name: entry.name };
        for (const key of Object.keys(TILE_DEFAULTS)) {
          if (key in entry) settings[key] = entry[key];
        }
        textures.push(setTile(settings));
      }
      // every texture loading at once, and the game waits for them all
      return Promise.all(textures);
    })
    .catch((err) => {
      console.warn(`Couldn't load the tiles file "${TILE_FILE}": ${err.message}.`);
    })
    // this last step runs whether the file loaded or not, because catch() above handled any problem
    .then(() => {
      // with no tiles at all, the blank stand-in map (maps.js) still needs its floor
      if (Object.keys(TILE_TYPES).length === 0) setTile({ name: 'blank', colour: '#ffffff' });
    });
}

// every tile as plain data, ready to save as tiles.json. each only has the settings that are different
// from TILE_DEFAULTS, plus its colour, so every line says what the tile looks like
function tilesToData() {
  // typeToData() is in utils.js
  const tiles = Object.values(TILE_TYPES)
    .sort((a, b) => a.layer - b.layer)
    .map((type) => typeToData(type, TILE_DEFAULTS));
  return { format: TILES_FORMAT, version: TILES_VERSION, tiles };
}

// the text that goes in tiles.json: one tile per line, so the file reads like a list (jsonLine() is
// in utils.js)
function tilesDataToText(data) {
  const lines = data.tiles.map(jsonLine);
  return `{\n  "format": "${data.format}",\n  "version": ${data.version},\n  "tiles": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
