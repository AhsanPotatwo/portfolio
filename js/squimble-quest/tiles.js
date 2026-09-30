// the tile catalogue: every kind of tile in the game, and what it does.
// a map (tilemap.js) only stores tile names like 'grass', and looks up everything else here.
//
// the tiles themselves are in one file, assets/squimble-quest/tiles/tiles.json, loaded when the game
// starts. this file loads it, keeps the tiles in TILE_TYPES, and turns them back into a file.
//
// ============================== how to make a tile ==============================
//
// in the map editor (dev mode, then B), open the Tiles tab and click + New tile. right click a tile
// in the bar to change it. changes show straight away, then Export tiles downloads a new tiles.json:
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
//
// damage and speed work for everyone: the player, enemies and npcs (checkTile() in character.js).
// the order of the tiles is the order in the editor's bar, and where two dual grid tiles meet, the one
// further down the file goes on top, so put the ones underneath first (dirt before grass)
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
  dualGrid: false,
  texture: null,
  solid: false,
  speed: 1,
  damagePerSecond: 0,
  damagePerStep: 0,
};

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
  Object.assign(type, TILE_DEFAULTS, settings);
  TILE_TYPES[type.name] = type;
  type.fill = color(type.colour);

  useTexture(type, picture);
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
  return fetch(TILE_FILE)
    .then((response) => {
      if (!response.ok) throw new Error(`the file wasn't found (${response.status})`);
      return response.json();
    })
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
      const hint = location.protocol === 'file:'
        ? ' It only loads when the site is run through a local server, see the README in the maps folder.'
        : '';
      console.warn(`Couldn't load the tiles file "${TILE_FILE}": ${err.message}.${hint}`);
    })
    .then(() => {
      // with no tiles at all, the blank stand-in map (maps.js) still needs its floor
      if (Object.keys(TILE_TYPES).length === 0) setTile({ name: 'blank', colour: '#ffffff' });
    });
}

// every tile as plain data, ready to save as tiles.json. each only has the settings that are different
// from TILE_DEFAULTS, plus its colour, so every line says what the tile looks like
function tilesToData() {
  const tiles = Object.values(TILE_TYPES)
    .sort((a, b) => a.layer - b.layer)
    .map((type) => {
      const entry = { name: type.name };
      for (const [key, value] of Object.entries(TILE_DEFAULTS)) {
        if (key === 'colour' || type[key] !== value) entry[key] = type[key];
      }
      return entry;
    });
  return { format: TILES_FORMAT, version: TILES_VERSION, tiles };
}

// the text that goes in tiles.json: one tile per line, so the file reads like a list
function tilesDataToText(data) {
  // indenting by 1 then swapping each line break (and its indent) for a space squashes a tile onto
  // one line, with spaces after the colons and commas
  const lines = data.tiles.map((tile) => `    ${JSON.stringify(tile, null, 1).replace(/\n\s*/g, ' ')}`);
  return `{\n  "format": "${data.format}",\n  "version": ${data.version},\n  "tiles": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

// ---------- art for everything else ----------

// run from preload() in sketch.js, before the game starts, for objects (objects.js), enemies, items
// and npcs (tiles load theirs in setTile() above):
//   prepareArt(OBJECT_TYPES, 'object')
// loads their images, and turns colours into p5 colours once now rather than every time
// something's drawn (thousands of times a second). kind is only used in the warning
function prepareArt(types, kind) {
  for (const type of Object.values(types)) {
    type.fill = color(type.colour);
    type.img = null;
    if (type.image) {
      type.img = loadImage(type.image, undefined, () => {
        console.warn(`Couldn't load "${type.image}" for the ${type.name} ${kind}, using its colour instead`);
        type.img = null;
      });
    }
    // npcs can have a portrait for the text box too (npcs.js)
    type.portraitImg = null;
    if (type.portrait) {
      type.portraitImg = loadImage(type.portrait, undefined, () => {
        console.warn(`Couldn't load "${type.portrait}" for the ${type.name} ${kind}'s portrait, using a placeholder instead`);
        type.portraitImg = null;
      });
    }
  }
}
