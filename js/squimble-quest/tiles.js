// the tile catalogue: every kind of tile in the game, and what it does.
// a map (tilemap.js) only stores tile names like 'grass', and looks up everything else here.
//
// ============================== how to make a tile ==============================
//
// add a defineTile() at the bottom of this file:
//
//   defineTile('grass', { colour: '#6fae4f' });
//
// you only give the settings that are different from TILE_DEFAULTS. the settings:
//
//   colour   placeholder colour, used when there's no image
//   image    a picture for the tile, e.g. image: 'assets/squimble-quest/tiles/grass.png'.
//            it's stretched to TILE x TILE (32 x 32), so 16 x 16 pixel art drawn at double size
//            works fine. images load before the game starts. if one can't be found, the tile
//            uses its colour instead and there's a warning in the browser console
//   tileset  a dual grid tileset instead of one picture, for ground that should blend into what's
//            next to it with rounded edges (grass, dirt, sand, stone...). see "dual grid tiles" below
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
// a new tile shows up in the map editor's Tiles tab by itself, ready to paint onto maps
//
// ---------- dual grid tiles ----------
//
//   defineTile('grass', { colour: '#6fae4f', tileset: 'assets/squimble-quest/maps/tilesets/grass_tileset.png' });
//
// maps and the editor work exactly the same: you still paint 'grass' onto tiles. only the drawing
// changes (drawTiles() in tilemap.js). a normal tile is drawn as one square on its own. a dual grid
// tile is drawn on a second grid, half a tile across and down from the normal one, so every piece
// sits where four tiles meet and shows which of those four are grass. that's how the edges and
// corners round themselves off without having to paint edge tiles by hand.
//
// the tileset is one picture, 4 x 4 pieces (e.g. 64 x 64 with 16 x 16 pieces), laid out like
// DUAL_TILESET_LAYOUT below. the see-through parts of a piece show the tile next to it underneath.
// when two dual grid tiles meet, the one defined further down this file goes on top
//
// =================================================================================

// which piece is where in a dual grid tileset, left to right, top row first. each number says which
// of the four tiles meeting at that piece are this tile, as four 1s and 0s: up left, up right,
// down left, down right. e.g. 0b0011 is the bottom two, so it's the piece along a top edge
const DUAL_TILESET_LAYOUT = [
  0b0010, 0b0101, 0b1011, 0b0011,
  0b1001, 0b0111, 0b1111, 0b1110,
  0b0100, 0b1100, 0b1101, 0b1010,
  0b0000, 0b0001, 0b0110, 0b1000,
];

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

// layer is how far down this file the tile is defined, so dual grid tiles further down go on top
function defineTile(name, settings) {
  TILE_TYPES[name] = { ...TILE_DEFAULTS, ...settings, name, layer: Object.keys(TILE_TYPES).length };
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
    // dual grid tiles: the tileset cut into its 16 pieces, dualTiles[which four] (see
    // DUAL_TILESET_LAYOUT above). cut into separate pictures rather than drawing parts of the big
    // one, because drawing part of a picture can pick up a line of the piece next to it at some
    // zooms, which shows as a faint grid. null draws it as a normal tile, in its colour
    type.dualTiles = null;
    if (type.tileset) {
      loadImage(type.tileset, (sheet) => {
        const size = sheet.width / 4;
        type.dualTiles = [];
        DUAL_TILESET_LAYOUT.forEach((which, i) => {
          type.dualTiles[which] = sheet.get((i % 4) * size, Math.floor(i / 4) * size, size, size);
        });
      }, () => {
        console.warn(`Couldn't load "${type.tileset}" for the ${type.name} ${kind}, using its colour instead`);
      });
    }
  }
}

// ---------- the tiles ----------
// placeholder colours until there's art

// ground you can walk on
defineTile('blank',  { colour: '#ffffff' }); // the default map's plain floor
defineTile('grass',  { colour: '#6fae4f', tileset: 'assets/squimble-quest/maps/tilesets/grass_tileset.png' });
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
