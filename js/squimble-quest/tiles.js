// the tile catalogue: every kind of tile and what it does. maps (tilemap.js) only store names like
// 'grass' and look everything else up here. each tile is a file in assets/squimble-quest/tiles/, like
// tiles/grass.json, listed in tiles/index.json (datafiles.js), and this file loads them into
// TILE_TYPES and can turn them back into files.
//
// ============================== how to make a tile ==============================
//
// in the map editor (dev mode, then B), go to the Tiles tab and press New in the inspector (or right
// click a tile in the palette to change it). changes show up straight away, and Export downloads the
// files of any tiles that are new or changed (plus any new picture) to put in
// assets/squimble-quest/tiles/. the full guide is assets/squimble-quest/tiles/README.md.
//
// by hand: a file named after the tile, like tiles/lava.json, with only the settings that are
// different from TILE_DEFAULTS (each one is explained there), and its name in tiles/index.json:
//   { "colour": "#e4572e", "speed": 0.7, "damagePerSecond": 25 }
// renaming a tile loses it from every map that uses it. the settings work on everyone (walk() and
// checkTile() in character.js). the order in index.json is the order in the editor bar, and where
// dual grid tiles meet the later one goes on top, so put the lower ones first (dirt before grass)
//
// ---------- adding a new tile setting ----------
//
//   1. add its normal value to TILE_DEFAULTS. anything that isn't in there gets ignored on load and save
//   2. make it do something, like in checkTile() in character.js for effects on whoever's standing there
//   3. add a TILE_BEHAVIOURS line (top of tileeditor.js) so it gets an editor row on the tab it names
//      (a tab name that doesn't exist yet makes a new tab)
// older tile files still load fine, missing settings just get the default
//
// =================================================================================

// paths from the root of the site
const TILE_IMAGE_FOLDER = 'assets/squimble-quest/tiles/normal/';
const DUAL_TILESET_FOLDER = 'assets/squimble-quest/tiles/dual-grid/';

// every tile starts with these, and they're also the only settings a tile can have
const TILE_DEFAULTS = {
  // what it looks like without a texture (also used in the editor bar for dual grid tiles with no
  // texture). it's pink so a missing colour is obvious, and a texture always covers it anyway
  colour: '#ff00ff',
  // true for ground that blends into its neighbours (grass, dirt, sand). drawn from a tileset on a
  // second grid (dualgrid.js)
  dualGrid: false,
  // the picture's file name, or null for just the colour. normal tiles look in TILE_IMAGE_FOLDER and
  // stretch it over each tile (16 x 16 pixel art works well). dual grid tiles look in
  // DUAL_TILESET_FOLDER and need 4 x 4 pieces
  texture: null,
  // can't be walked on (walls, deep water)
  solid: false,
  // solid, but doesn't block seeing past it (water), so enemies can spot you across it (clearLine()
  // in tilemap.js)
  seeThrough: false,
  // walking speed multiplier, 0.5 is half speed
  speed: 1,
  // hurts whoever's on it every second (lava), and every time they step onto it (spikes)
  damagePerSecond: 0,
  damagePerStep: 0,
  // heals whoever's on it every second, up to their max (a healing spring)
  healPerSecond: 0,
  // 0 to 0.95, ice is 0.9. you keep sliding the way you were going and only turn slowly, until you
  // hit something
  slippery: 0,
  // "up", "down", "left" or "right" (PUSH_DIRECTIONS). pushes whoever's on it that way at pushSpeed
  // tiles a second (conveyor belts, currents, wind). walking is 5. 0 doesn't push
  pushDirection: null,
  pushSpeed: 0,
  // the dual grid tiles that round off onto this one, like ["grass"]. null means all of them and []
  // means none. the rest stop in a straight line at its edge (looks better on planks and walls)
  blendsWith: null,
  // the particle effects it keeps making, like ["lava-bubbles", "lava-smoke"] (particles/), or null
  // for none. each one bursts its rate (its Keep going tab) times a second on each tile on screen,
  // times particleRate (0.5 is half as often) (ParticleEmitters in particles.js)
  particles: null,
  particleRate: 1,
};

// does the dual grid tile `dual` round off onto `tile`? if not, it stops in a straight line at tile's
// edge (drawDualCorner() in dualgrid.js)
function blendsOnto(tile, dual) {
  return !tile.blendsWith || tile.blendsWith.includes(dual.name);
}

// pushDirection names to x, y
const PUSH_DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// how fast you can turn on a slippery tile before slipperiness is taken into account (it's an
// approach() speed, utils.js). 0.9 slippery leaves you a tenth of it
const SLIPPERY_GRIP = 10;

// every tile by name, from the tile files (bottom of this file) and the tile editor. each has its settings plus:
//   layer       its position in the list. later dual grid tiles go on top
//   fill        its colour as a p5 colour, made once
//   textureImg  the texture (a p5 image) or null. the tile editor shows it
//   img         a normal tile's picture, or null
//   dualTiles   a dual grid tileset cut into pieces (dualgrid.js), or null
// without an img or dualTiles (no texture, or it hasn't loaded) it's drawn in its colour
const TILE_TYPES = {};

// adds a tile, or changes one, from its file's settings plus its name. its texture loads from its folder unless
// you pass in `picture` (a p5 image, like one just chosen in the tile editor). gives back a promise
// that finishes when the texture has loaded or failed, so the game can wait for it
function setTile(settings, picture = null) {
  // a tile that's being changed keeps its place, a new one goes on the end
  const type = TILE_TYPES[settings.name] ?? { layer: Object.keys(TILE_TYPES).length };
  // defaults go on first, so a setting that's been left out goes back to normal instead of keeping
  // its old value
  Object.assign(type, TILE_DEFAULTS, settings);
  TILE_TYPES[type.name] = type;
  type.fill = color(type.colour);

  useTexture(type, picture);
  // nothing to load
  if (picture || !type.texture) return Promise.resolve();
  // it's just its colour until the texture loads
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

// draw the tile with this p5 image from now on, or with its colour if it's null. a dual grid tileset
// that isn't 4 x 4 pieces also falls back to the colour
function useTexture(type, img) {
  type.textureImg = img;
  type.img = img && !type.dualGrid ? img : null;
  type.dualTiles = img && type.dualGrid ? cutDualTileset(img, type.texture) : null;
}

// ---------- the tile files ----------

// every tile and its texture loads once at the start, before the maps (mapfile.js), because those
// check their tiles exist (datafiles.js)
DataFiles.register('tile', {
  define: (name, entry) => {
    // only keys from TILE_DEFAULTS, so a typo can't add junk
    const settings = { name };
    for (const key of Object.keys(TILE_DEFAULTS)) {
      if (key in entry) settings[key] = entry[key];
    }
    return setTile(settings);
  },
  // the blank stand-in map (maps.js) still needs a floor
  loaded: () => {
    if (Object.keys(TILE_TYPES).length === 0) setTile({ name: 'blank', colour: '#ffffff' });
  },
  names: () => Object.values(TILE_TYPES).sort((a, b) => a.layer - b.layer).map((type) => type.name),
  toData: (name) => typeToData(TILE_TYPES[name], TILE_DEFAULTS), // utils.js
});
