// the tile catalogue: every tile kind and what it does. maps (tilemap.js) only store names like
// 'grass' and look the rest up here. tiles live in assets/squimble-quest/tiles/tiles.json; this file
// loads it into TILE_TYPES and turns them back into a file.
//
// ============================== how to make a tile ==============================
//
// map editor (dev mode, B), Tiles tab, New in the inspector (right click a palette tile to change
// one). changes show straight away; Export tiles downloads tiles.json (and any new picture) to put in
// assets/squimble-quest/tiles/. full guide: assets/squimble-quest/tiles/README.md.
//
// by hand: one line per tile, only settings that differ from TILE_DEFAULTS (each explained there):
//   { "name": "lava", "colour": "#e4572e", "speed": 0.7, "damagePerSecond": 25 }
// renaming a tile loses it from every map using it. settings work for everyone (walk() and
// checkTile() in character.js). file order is the editor bar's order, and where dual grid tiles meet
// the later one goes on top, so put lower ones first (dirt before grass)
//
// ---------- adding a new tile setting ----------
//
//   1. TILE_DEFAULTS: its normal value. anything not there is ignored on load and save
//   2. what it changes, e.g. checkTile() in character.js for effects on whoever's standing there
//   3. a TILE_BEHAVIOURS line (top of tileeditor.js), giving it an editor row on the tab it names
//      (a new tab name makes a tab)
// older tiles.json files still load; missing settings get the default
//
// =================================================================================

// paths from the site root
const TILE_FILE = 'assets/squimble-quest/tiles/tiles.json';
const TILE_IMAGE_FOLDER = 'assets/squimble-quest/tiles/normal/';
const DUAL_TILESET_FOLDER = 'assets/squimble-quest/tiles/dual-grid/';

// top of tiles.json, like a map file's (mapfile.js)
const TILES_FORMAT = 'squimble-quest-tiles';
const TILES_VERSION = 1;

// every tile starts with these; also the only settings a tile can have
const TILE_DEFAULTS = {
  // the look without a texture (and in the editor bar for textureless dual grid tiles). pink so a
  // missing colour is obvious; a texture always covers it
  colour: '#ff00ff',
  // true: ground that blends into its neighbours (grass, dirt, sand), drawn from a tileset on a
  // second grid (dualgrid.js)
  dualGrid: false,
  // picture file name, null for just colour. normal tiles: in TILE_IMAGE_FOLDER, stretched over each
  // tile (16 x 16 pixel art works well). dual grid: in DUAL_TILESET_FOLDER, 4 x 4 pieces
  texture: null,
  // blocks walking (walls, deep water)
  solid: false,
  // walking speed multiplier, 0.5 is half
  speed: 1,
  // hurts whoever's on it per second (lava), and per step onto it (spikes)
  damagePerSecond: 0,
  damagePerStep: 0,
  // heals whoever's on it per second, up to max (healing spring)
  healPerSecond: 0,
  // 0 to 0.95, 0.9 is ice: you keep going your way and turn slowly until you hit something
  slippery: 0,
  // "up"/"down"/"left"/"right" (PUSH_DIRECTIONS): pushes whoever's on it that way at pushSpeed
  // tiles/s (conveyors, currents, wind). walking is 5. 0 doesn't push
  pushDirection: null,
  pushSpeed: 0,
  // dual grid tile names that round off onto it, e.g. ["grass"]; null is all, [] none. the rest stop
  // in a straight line at its edge (looks better on planks and walls)
  blendsWith: null,
};

// does dual grid tile `dual` round off onto `tile`? if not, it stops straight at tile's edge
// (drawDualCorner() in dualgrid.js)
function blendsOnto(tile, dual) {
  return !tile.blendsWith || tile.blendsWith.includes(dual.name);
}

// pushDirection → x, y
const PUSH_DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// turning speed on slippery tiles before slipperiness is applied (approach() speed in utils.js).
// 0.9 slippery leaves a tenth of it
const SLIPPERY_GRIP = 10;

// every tile by name, from tiles.json (loadTileFile()) and the tile editor. settings plus:
//   layer       list position; later dual grid tiles go on top
//   fill        colour as a p5 colour, made once
//   textureImg  the texture (p5 image) or null; the tile editor shows it
//   img         a normal tile's picture, or null
//   dualTiles   a dual grid tileset's pieces (dualgrid.js), or null
// without img/dualTiles (no texture, or not loaded) it's drawn in its colour
const TILE_TYPES = {};

// adds or changes a tile from its tiles.json settings. its texture loads from its folder unless
// picture (p5 image, e.g. just chosen in the tile editor) is given. promise resolves when the texture
// is ready or failed, so the game can wait
function setTile(settings, picture = null) {
  // a changed tile keeps its place, a new one goes last
  const type = TILE_TYPES[settings.name] ?? { layer: Object.keys(TILE_TYPES).length };
  // defaults first, so a left-out setting resets rather than keeping its old value
  Object.assign(type, TILE_DEFAULTS, settings);
  TILE_TYPES[type.name] = type;
  type.fill = color(type.colour);

  useTexture(type, picture);
  // nothing to load
  if (picture || !type.texture) return Promise.resolve();
  // just colour until it loads
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

function texturePath(type) {
  return (type.dualGrid ? DUAL_TILESET_FOLDER : TILE_IMAGE_FOLDER) + type.texture;
}

// draw with this p5 image from now on, or colour for null. a dual grid tileset that isn't 4 x 4
// pieces also falls back to colour
function useTexture(type, img) {
  type.textureImg = img;
  type.img = img && !type.dualGrid ? img : null;
  type.dualTiles = img && type.dualGrid ? cutDualTileset(img, type.texture) : null;
}

// ---------- tiles.json ----------

// loads every tile and texture, once at start, before the maps (mapfile.js) which check their tiles.
// promise resolves when done or failed. like map files, problems are console warnings, never fatal
function loadTileFile() {
  return fetchJson(TILE_FILE)
    .then((data) => {
      if (!Array.isArray(data?.tiles)) throw new Error("it doesn't look like a Squimble Quest tiles file");
      const textures = [];
      for (const entry of data.tiles) {
        if (typeof entry.name !== 'string' || entry.name === '') {
          console.warn(`A tile in ${TILE_FILE} has no name, so it's been left out`);
          continue;
        }
        // only TILE_DEFAULTS keys, so typos can't add junk
        const settings = { name: entry.name };
        for (const key of Object.keys(TILE_DEFAULTS)) {
          if (key in entry) settings[key] = entry[key];
        }
        textures.push(setTile(settings));
      }
      return Promise.all(textures);
    })
    .catch((err) => {
      console.warn(`Couldn't load the tiles file "${TILE_FILE}": ${err.message}.`);
    })
    // runs either way, since catch() handled any problem
    .then(() => {
      // the blank stand-in map (maps.js) still needs a floor
      if (Object.keys(TILE_TYPES).length === 0) setTile({ name: 'blank', colour: '#ffffff' });
    });
}

// every tile as tiles.json data (typeToData() in utils.js)
function tilesToData() {
  const tiles = Object.values(TILE_TYPES)
    .sort((a, b) => a.layer - b.layer)
    .map((type) => typeToData(type, TILE_DEFAULTS));
  return { format: TILES_FORMAT, version: TILES_VERSION, tiles };
}

// tiles.json text, one tile per line (jsonLine() in utils.js)
function tilesDataToText(data) {
  const lines = data.tiles.map(jsonLine);
  return `{\n  "format": "${data.format}",\n  "version": ${data.version},\n  "tiles": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
