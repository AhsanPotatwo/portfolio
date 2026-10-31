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
// rename or delete tiles in the tile editor, which keeps maps working (oldNames). the settings work on
// everyone (walk() and checkTile() in character.js). the order in index.json is the order in the editor bar, and where
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
  // more pictures for a normal tile with a texture, like ["grass-2.png", "grass-3.png"]
  // (TILE_IMAGE_FOLDER). each tile on the map shows the texture or one of these, picked by where it is
  // so it never changes, so a field doesn't look like the same square over and over. null for none
  variants: null,
  // pictures it goes through after its texture, like ["water-2.png", "water-3.png"], one every
  // frameTime seconds, so it moves (water, lava, flowers in the wind). every tile of the kind moves
  // together. a tile with frames doesn't use its variants. normal tiles only, null for none
  frames: null,
  frameTime: 0.25,
  // the names it had before, like ["flowers"], so maps that still say an old name get this tile. the
  // tile editor adds to it when a tile's renamed, or deleted with this one to replace it
  oldNames: null,
  // can't be walked on (walls, deep water)
  solid: false,
  // solid, but doesn't block seeing past it (deep water, a chasm), so enemies can spot you across it
  // (clearLine() in tilemap.js)
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
  // the sounds it keeps making, like ["lava-bubbling", "lava-rumble"] (sounds/), or null for none.
  // each one loops from the closest few tiles of this kind you can hear (SoundBlocks.updateTiles() in
  // soundblocks.js)
  sounds: null,
  // times how loud they are, 0.5 is half
  soundVolume: 1,
  // how many tiles away they're heard, or 0 for each sound's own Heard from
  soundRange: 0,
  // the most tiles of this kind each sound plays from at once, the closest ones. it's what stops a
  // lake of lava being hundreds of loops: more is fuller and louder in the middle of a big patch
  soundSpots: 3,
  // each of those plays up to this much higher or lower (0.1 is 10%), picked at random when it
  // starts, so they don't sound like copies of each other
  soundPitchVariety: 0.08,
  // footsteps on it, like ["grass-step"] (sounds/), or null for none. each step plays one at random,
  // never the same one twice in a row, so a few takes of a step sound less like a machine
  // (Character.footstep() in character.js, how often is FOOTSTEPS in config.js)
  stepSounds: null,
  // times how loud they are, 0.5 is half
  stepVolume: 1,
  // times how fast they play, so higher and shorter (2) or lower and longer (0.5). lets one step sound
  // do for a few materials, like dirt-step at 0.7 for mud
  stepPitch: 1,
  // each step plays up to this much higher or lower (0.1 is 10%), at random
  stepPitchVariety: 0.1,
  // how many tiles away other people's steps are heard, or 0 for each sound's own Heard from
  stepRange: 0,

  // ---------- liquids (water, lava, mud, slime...) ----------
  // anything with a sink over 0 is a liquid: whoever's in it sinks in that much of their height (0.4
  // is about the waist), shallower near the shore like a beach (Character.depthAt()), with the part
  // under hidden or seen through it and a ring where they meet the surface (drawInLiquid() in
  // character.js, LIQUID in config.js). make it slow (speed) or hurt (damagePerSecond) as well
  sink: 0,
  // how much of the part under shows through, wobbling: 0 hides it (lava, mud), 1 is clear
  clarity: 0.4,
  // the ring round whoever's in it, where they meet the surface
  surfaceColour: '#ffffff',
  // it gives off light (lava): the ring glows and so does whoever's in it, from the surface up
  glow: false,
  // how strong the V shaped wake behind whoever wades through it is (wakes.js): 1 is normal, lower is
  // fainter (thick lava), 0 is none
  wake: 1,
  // particle effects (particles/): splash bursts when someone steps in, and ripple every so often
  // round them while they stand in it. ripples lie flat on the surface
  splashParticles: null,
  rippleParticles: null,
  // sounds (sounds/) for stepping in, one at random. wading is just stepSounds
  splashSounds: null,
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
//   variantImgs the variants' pictures that loaded, maybe none (tileImageAt())
//   frameImgs   the frames' pictures that loaded, maybe none
//   dualTiles   a dual grid tileset cut into pieces (dualgrid.js), or null
// without an img or dualTiles (no texture, or it hasn't loaded) it's drawn in its colour
const TILE_TYPES = {};

// adds a tile, or changes one, from its file's settings plus its name. its texture loads from its folder unless
// you pass in `picture` (a p5 image, like one just chosen in the tile editor). gives back a promise
// that finishes when the texture has loaded or failed, so the game can wait for it
//
// multiplayer: this calls p5 (color(), loadImage()), so a server without p5 couldn't load tiles. the
// rules only need the settings, so the colour and pictures would go in a drawing-only step after.
// prepareArt() (utils.js) does the same for the other catalogues
function setTile(settings, picture = null) {
  // a tile that's being changed keeps its place, a new one goes on the end (after the last one, since
  // deleting tiles leaves gaps)
  const type = TILE_TYPES[settings.name] ?? { layer: Math.max(-1, ...Object.values(TILE_TYPES).map((other) => other.layer)) + 1 };
  // defaults go on first, so a setting that's been left out goes back to normal instead of keeping
  // its old value
  Object.assign(type, TILE_DEFAULTS, settings);
  TILE_TYPES[type.name] = type;
  type.fill = color(type.colour);

  useTexture(type, picture);
  const extras = useExtraPictures(type);
  // nothing to load
  if (picture || !type.texture) return extras;
  // it's just its colour until the texture loads
  return Promise.all([extras, new Promise((done) => {
    loadImage(texturePath(type), (img) => {
      useTexture(type, img);
      done();
    }, () => {
      artProblem('tile', type.name, texturePath(type), "couldn't load, so it's its colour"); // utils.js
      done();
    });
  })]);
}

// the variants' and frames' pictures (a normal tile's), from TILE_PICTURES. they're empty lists until
// they load, and one that changed again in the meantime (the tile editor's live preview) is left alone
function useExtraPictures(type) {
  const loads = [['variantImgs', 'variants'], ['frameImgs', 'frames']].map(([key, setting]) => {
    type[key] = [];
    const files = type.dualGrid ? null : type[setting];
    if (!files?.length) return null;
    const wanted = JSON.stringify(files);
    return Promise.all(files.map((file) => tilePicture(file, type.name))).then((imgs) => {
      if (JSON.stringify(type[setting]) === wanted && !type.dualGrid) type[key] = imgs.filter(Boolean);
    });
  });
  return Promise.all(loads);
}

// variant and frame pictures by file name, each a promise of its p5 image (null if it didn't load), so
// a picture is only loaded once. the tile editor puts pictures you choose in here too
const TILE_PICTURES = {};

function tilePicture(file, tileName) {
  TILE_PICTURES[file] ??= new Promise((done) => {
    loadImage(TILE_IMAGE_FOLDER + file, done, () => {
      artProblem('tile', tileName, TILE_IMAGE_FOLDER + file, "couldn't load, so that picture's left out"); // utils.js
      done(null);
    });
  });
  return TILE_PICTURES[file];
}

// the picture a normal tile with a texture shows at col, row: with frames, the one they're up to (every
// tile of the kind together), with variants, one picked by where it is (so it doesn't change), and
// otherwise its texture. tilemap.js draws with it
function tileImageAt(type, col, row) {
  if (type.frameImgs.length > 0) {
    const pictures = [type.img, ...type.frameImgs];
    return pictures[Math.floor(millis() / 1000 / Math.max(0.02, type.frameTime)) % pictures.length];
  }
  if (type.variantImgs.length > 0) {
    const pictures = [type.img, ...type.variantImgs];
    return pictures[tileHash(col, row) % pictures.length];
  }
  return type.img;
}

// a number that looks random but is always the same for the same col, row, so neighbours don't match
function tileHash(col, row) {
  let h = Math.imul(col, 374761393) + Math.imul(row, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// the tile a map's name for one means: itself if there's a tile called that, otherwise the tile that
// used to be called it (oldNames), otherwise the name as it is (so it shows as unknown)
function resolveTileName(name) {
  if (name === null || name === undefined || TILE_TYPES[name]) return name;
  return Object.values(TILE_TYPES).find((type) => type.oldNames?.includes(name))?.name ?? name;
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
    const settings = {};
    for (const key of Object.keys(TILE_DEFAULTS)) {
      if (key in entry) settings[key] = entry[key];
    }
    // a word where a number should be keeps the default (utils.js), or whoever walks on it goes NaN
    return setTile(withDefaults(TILE_DEFAULTS, 'tile', name, settings));
  },
  // the blank stand-in map (maps.js) still needs a floor
  loaded: () => {
    if (Object.keys(TILE_TYPES).length === 0) setTile({ name: 'blank', colour: '#ffffff' });
  },
  names: () => Object.values(TILE_TYPES).sort((a, b) => a.layer - b.layer).map((type) => type.name),
  toData: (name) => typeToData(TILE_TYPES[name], TILE_DEFAULTS), // utils.js
});
