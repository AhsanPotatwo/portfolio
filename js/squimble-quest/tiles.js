// the tile catalogue: every kind of tile in the game, and what it does.
// a map (tilemap.js) only stores tile names like 'grass', and looks up everything else here.
//
// ============================== how to make a tile ==============================
//
// add a defineTile() at the bottom of this file:
//
//   defineTile('stone', { colour: '#8a8f99' });
//
// that's a working tile already, drawn in its colour. it shows up in the map editor's Tiles tab by
// itself, ready to paint onto maps. to give it art, pick one of these two kinds:
//
//   a normal tile, one picture drawn on each tile (planks, a tiled floor, a wall):
//     1. draw it (16 x 16 pixel art works well) and save it in assets/squimble-quest/tiles/normal/
//     2. give its file name:  defineTile('planks', { colour: '#b98a55', image: 'planks.png' });
//
//   a dual grid tile, ground whose edges round off and blend into the tiles next to it (grass,
//   dirt, sand, stone, gravel):
//     1. copy tiles/dual-grid/grass_tileset.png and paint over it, keeping every piece where it is
//        (the layout is DUAL_TILESET_LAYOUT in dualgrid.js)
//     2. save it in assets/squimble-quest/tiles/dual-grid/
//     3. give its file name:  defineTile('dirt', { colour: '#a47148', tileset: 'dirt_tileset.png' });
//   the editor marks dual grid tiles with a little badge. how they work is at the top of dualgrid.js
//
// you only give the settings that are different from TILE_DEFAULTS. the settings:
//
//   colour   placeholder colour, used when there's no art (or it can't be found). dual grid tiles
//            use it as their colour in the map editor's bar too, so pick one that matches the art
//   image    a normal tile's picture, a file name in TILE_IMAGE_FOLDER. it's stretched to TILE x TILE
//            (32 x 32), so 16 x 16 pixel art is drawn at double size
//   tileset  a dual grid tile's tileset, a file name in DUAL_TILESET_FOLDER. a square picture of
//            4 x 4 pieces, any size (64 x 64 is 16 x 16 pieces)
//   solid    true stops anything walking onto it (walls, deep water)
//   speed    how fast you walk on it compared to normal. 1 is normal, 0.5 is half speed
//   onEnter  runs once every time something steps onto one of these tiles:
//              onEnter: (entity) => entity.hurt(10)
//   onStand  runs every frame something is standing on it:
//              onStand: (entity, dt) => entity.hurt(20 * dt)
//            dt is seconds since the last frame, so "20 * dt" means 20 damage per second
//
// entity is whoever stepped on the tile: the player, an enemy or an npc (they're all Characters,
// character.js). behaviours can do anything to them a Character can do: hurt(), change speed, teleport...
//
// art loads before the game starts. if a file can't be found, or a tileset isn't 4 x 4 pieces, the
// tile uses its colour instead and the browser console says why.
//
// where dual grid tiles meet each other, the one defined further down this file goes on top, so put
// the ones underneath first (dirt before grass)
//
// =================================================================================

// where tile art lives, from the site's main folder. image and tileset are file names in these
const TILE_IMAGE_FOLDER = 'assets/squimble-quest/tiles/normal/';
const DUAL_TILESET_FOLDER = 'assets/squimble-quest/tiles/dual-grid/';

// what every tile starts with before its own settings are added
const TILE_DEFAULTS = {
  // bright pink, so a tile that forgot its colour is easy to spot
  colour: '#ff00ff',
  image: null,
  tileset: null,
  solid: false,
  speed: 1,
  onEnter: null,
  onStand: null,
};

// every tile, by name. filled in by defineTile() below
const TILE_TYPES = {};

// layer is how far down this file the tile is defined, so dual grid tiles further down go on top.
// image and tileset get their folder added, so from here on they're the full path to the file
function defineTile(name, settings) {
  const type = { ...TILE_DEFAULTS, ...settings, name, layer: Object.keys(TILE_TYPES).length };
  if (type.image) type.image = TILE_IMAGE_FOLDER + type.image;
  if (type.tileset) type.tileset = DUAL_TILESET_FOLDER + type.tileset;
  TILE_TYPES[name] = type;
}

// run from preload() in sketch.js, before the game starts, for tiles and objects (objects.js):
//   prepareArt(TILE_TYPES, 'tile')
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
    // dual grid tiles: their tileset cut into pieces, type.dualTiles (dualgrid.js). only tiles have
    // a tileset, everything else gets null
    loadDualTileset(type);
  }
}

// ---------- the tiles ----------
// placeholder colours until there's art

// ground you can walk on
defineTile('blank',  { colour: '#ffffff' }); // the default map's plain floor
defineTile('grass',  { colour: '#6fae4f', tileset: 'grass_tileset.png' });
defineTile('dirt',   { colour: '#a47148' });
defineTile('planks', { colour: '#b98a55' });
defineTile('sand',   { colour: '#e6d28e', speed: 0.8 });

// can't walk through
defineTile('wall',   { colour: '#5f6470', solid: true });
defineTile('water',  { colour: '#3b7dd8', solid: true });
// the top of a building, seen from above. its inside is a map of its own, through a warp (warps.js)
defineTile('roof',   { colour: '#8e4a3c', solid: true });

// hurts you. lava hurts the whole time you stand in it, spikes hurt once per tile you step on
defineTile('lava', {
  colour: '#e4572e',
  speed: 0.7,
  onStand: (entity, dt) => entity.hurt(25 * dt),
});
defineTile('spikes', {
  colour: '#9d8bb0',
  onEnter: (entity) => entity.hurt(15),
});
